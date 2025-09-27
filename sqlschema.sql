--
-- PostgreSQL database dump
--

\restrict 7Jgl6dBHbTsH1T7jFyZ8aqUzD3MdvMumSRkOWdGHxlH3fKSHGJEFrpsPV9UKsM3

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

-- Started on 2025-09-27 13:12:51

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 2 (class 3079 OID 16662)
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- TOC entry 4644 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- TOC entry 255 (class 1255 OID 16858)
-- Name: update_agent_ticket_count(); Type: FUNCTION; Schema: public; Owner: avnadmin
--

CREATE FUNCTION public.update_agent_ticket_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.assigned_agent_id IS NOT NULL THEN
        -- Increment count when ticket is assigned
        INSERT INTO agent_status (agent_id, active_tickets_count, updated_at)
        VALUES (NEW.assigned_agent_id, 1, NOW())
        ON CONFLICT (agent_id) 
        DO UPDATE SET 
            active_tickets_count = agent_status.active_tickets_count + 1,
            updated_at = NOW();
            
    ELSIF TG_OP = 'UPDATE' THEN
        -- Handle assignment changes
        IF OLD.assigned_agent_id IS NOT NULL AND NEW.assigned_agent_id IS NULL THEN
            -- Ticket unassigned
            UPDATE agent_status 
            SET active_tickets_count = GREATEST(active_tickets_count - 1, 0),
                updated_at = NOW()
            WHERE agent_id = OLD.assigned_agent_id;
                
        ELSIF OLD.assigned_agent_id IS NULL AND NEW.assigned_agent_id IS NOT NULL THEN
            -- Ticket assigned
            INSERT INTO agent_status (agent_id, active_tickets_count, updated_at)
            VALUES (NEW.assigned_agent_id, 1, NOW())
            ON CONFLICT (agent_id) 
            DO UPDATE SET 
                active_tickets_count = agent_status.active_tickets_count + 1,
                updated_at = NOW();
                
        ELSIF OLD.assigned_agent_id IS NOT NULL AND NEW.assigned_agent_id IS NOT NULL 
              AND OLD.assigned_agent_id != NEW.assigned_agent_id THEN
            -- Ticket reassigned
            UPDATE agent_status 
            SET active_tickets_count = GREATEST(active_tickets_count - 1, 0),
                updated_at = NOW()
            WHERE agent_id = OLD.assigned_agent_id;
            
            INSERT INTO agent_status (agent_id, active_tickets_count, updated_at)
            VALUES (NEW.assigned_agent_id, 1, NOW())
            ON CONFLICT (agent_id) 
            DO UPDATE SET 
                active_tickets_count = agent_status.active_tickets_count + 1,
                updated_at = NOW();
        END IF;
        
        -- Handle status changes that affect ticket counts
        IF OLD.status != NEW.status THEN
            IF NEW.status IN ('resolved', 'closed') AND OLD.status NOT IN ('resolved', 'closed') THEN
                -- Ticket completed, decrement count
                IF NEW.assigned_agent_id IS NOT NULL THEN
                    UPDATE agent_status 
                    SET active_tickets_count = GREATEST(active_tickets_count - 1, 0),
                        updated_at = NOW()
                    WHERE agent_id = NEW.assigned_agent_id;
                END IF;
            ELSIF OLD.status IN ('resolved', 'closed') AND NEW.status NOT IN ('resolved', 'closed') THEN
                -- Ticket reopened, increment count
                IF NEW.assigned_agent_id IS NOT NULL THEN
                    INSERT INTO agent_status (agent_id, active_tickets_count, updated_at)
                    VALUES (NEW.assigned_agent_id, 1, NOW())
                    ON CONFLICT (agent_id) 
                    DO UPDATE SET 
                        active_tickets_count = agent_status.active_tickets_count + 1,
                        updated_at = NOW();
                END IF;
            END IF;
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION public.update_agent_ticket_count() OWNER TO avnadmin;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 231 (class 1259 OID 16808)
-- Name: agent_status; Type: TABLE; Schema: public; Owner: avnadmin
--

CREATE TABLE public.agent_status (
    agent_id uuid NOT NULL,
    status character varying(20) DEFAULT 'offline'::character varying,
    active_tickets_count integer DEFAULT 0,
    last_activity timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT agent_status_active_tickets_count_check CHECK (((active_tickets_count >= 0) AND (active_tickets_count <= 2))),
    CONSTRAINT agent_status_status_check CHECK (((status)::text = ANY ((ARRAY['online'::character varying, 'offline'::character varying, 'busy'::character varying])::text[])))
);


ALTER TABLE public.agent_status OWNER TO avnadmin;

--
-- TOC entry 227 (class 1259 OID 16539)
-- Name: driver_actions; Type: TABLE; Schema: public; Owner: avnadmin
--

CREATE TABLE public.driver_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    driver_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    action_type character varying(50) NOT NULL,
    reason text NOT NULL,
    fine_amount numeric(10,2),
    suspension_duration character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT driver_actions_action_type_check CHECK (((action_type)::text = ANY (ARRAY[('warning'::character varying)::text, ('fine'::character varying)::text, ('suspension'::character varying)::text])))
);


ALTER TABLE public.driver_actions OWNER TO avnadmin;

--
-- TOC entry 220 (class 1259 OID 16483)
-- Name: driver_documents; Type: TABLE; Schema: public; Owner: avnadmin
--

CREATE TABLE public.driver_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    driver_id uuid NOT NULL,
    document_type character varying(50) NOT NULL,
    file_url character varying(255) NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    rejection_reason text,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT driver_documents_document_type_check CHECK (((document_type)::text = ANY (ARRAY[('license'::character varying)::text, ('rc'::character varying)::text, ('photo'::character varying)::text, ('aadhaar'::character varying)::text]))),
    CONSTRAINT driver_documents_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('approved'::character varying)::text, ('rejected'::character varying)::text])))
);


ALTER TABLE public.driver_documents OWNER TO avnadmin;

--
-- TOC entry 225 (class 1259 OID 16520)
-- Name: driver_ledger; Type: TABLE; Schema: public; Owner: avnadmin
--

CREATE TABLE public.driver_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    driver_id uuid NOT NULL,
    ride_id uuid,
    amount numeric(10,2) NOT NULL,
    type character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT driver_ledger_type_check CHECK (((type)::text = ANY (ARRAY[('ride_earning'::character varying)::text, ('platform_fee'::character varying)::text, ('tip'::character varying)::text, ('fine'::character varying)::text, ('incentive'::character varying)::text, ('cash_collected'::character varying)::text])))
);


ALTER TABLE public.driver_ledger OWNER TO avnadmin;

--
-- TOC entry 226 (class 1259 OID 16526)
-- Name: driver_payouts; Type: TABLE; Schema: public; Owner: avnadmin
--

CREATE TABLE public.driver_payouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    driver_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    status character varying(50) NOT NULL,
    settlement_period_start timestamp with time zone NOT NULL,
    settlement_period_end timestamp with time zone NOT NULL,
    gateway_payout_id character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT driver_payouts_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('processing'::character varying)::text, ('completed'::character varying)::text, ('failed'::character varying)::text])))
);


ALTER TABLE public.driver_payouts OWNER TO avnadmin;

--
-- TOC entry 221 (class 1259 OID 16493)
-- Name: driver_vehicles; Type: TABLE; Schema: public; Owner: avnadmin
--

CREATE TABLE public.driver_vehicles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    driver_id uuid NOT NULL,
    model_name character varying(255) NOT NULL,
    registration_number character varying(20) NOT NULL,
    category character varying(50) NOT NULL,
    fuel_type character varying(50) NOT NULL,
    CONSTRAINT driver_vehicles_category_check CHECK (((category)::text = ANY (ARRAY[('bike'::character varying)::text, ('auto'::character varying)::text, ('car'::character varying)::text, ('commercial'::character varying)::text]))),
    CONSTRAINT driver_vehicles_fuel_type_check CHECK (((fuel_type)::text = ANY (ARRAY[('petrol'::character varying)::text, ('diesel'::character varying)::text, ('electric'::character varying)::text, ('cng'::character varying)::text, ('hybrid'::character varying)::text])))
);


ALTER TABLE public.driver_vehicles OWNER TO avnadmin;

--
-- TOC entry 219 (class 1259 OID 16476)
-- Name: drivers; Type: TABLE; Schema: public; Owner: avnadmin
--

CREATE TABLE public.drivers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    city character varying(100),
    status character varying(50) DEFAULT 'pending_verification'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_verified boolean DEFAULT false NOT NULL,
    CONSTRAINT drivers_status_check CHECK (((status)::text = ANY (ARRAY[('pending_verification'::character varying)::text, ('active'::character varying)::text, ('suspended'::character varying)::text])))
);


ALTER TABLE public.drivers OWNER TO avnadmin;

--
-- TOC entry 228 (class 1259 OID 16724)
-- Name: platform_staff; Type: TABLE; Schema: public; Owner: avnadmin
--

CREATE TABLE public.platform_staff (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(50) NOT NULL,
    city character varying(100),
    status character varying(50) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    last_login timestamp with time zone,
    created_by uuid,
    CONSTRAINT platform_staff_role_check CHECK (((role)::text = ANY ((ARRAY['central_admin'::character varying, 'city_admin'::character varying, 'support_agent'::character varying, 'support'::character varying])::text[]))),
    CONSTRAINT platform_staff_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'suspended'::character varying, 'inactive'::character varying])::text[])))
);


ALTER TABLE public.platform_staff OWNER TO avnadmin;

--
-- TOC entry 222 (class 1259 OID 16499)
-- Name: rides; Type: TABLE; Schema: public; Owner: avnadmin
--

CREATE TABLE public.rides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    driver_id uuid,
    pickup_address text NOT NULL,
    destination_address text NOT NULL,
    pickup_latitude numeric(9,6) NOT NULL,
    pickup_longitude numeric(9,6) NOT NULL,
    destination_latitude numeric(9,6) NOT NULL,
    destination_longitude numeric(9,6) NOT NULL,
    status character varying(50) NOT NULL,
    fare numeric(10,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rides_status_check CHECK (((status)::text = ANY (ARRAY[('requested'::character varying)::text, ('accepted'::character varying)::text, ('in_progress'::character varying)::text, ('completed'::character varying)::text, ('cancelled'::character varying)::text])))
);


ALTER TABLE public.rides OWNER TO avnadmin;

--
-- TOC entry 233 (class 1259 OID 16861)
-- Name: servicable_cities; Type: TABLE; Schema: public; Owner: avnadmin
--

CREATE TABLE public.servicable_cities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    city_name character varying(100) NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    launch_date date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT servicable_cities_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('inactive'::character varying)::text, ('coming_soon'::character varying)::text])))
);


ALTER TABLE public.servicable_cities OWNER TO avnadmin;

--
-- TOC entry 229 (class 1259 OID 16762)
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: avnadmin
--

CREATE TABLE public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    assigned_agent_id uuid,
    city character varying(100) NOT NULL,
    subject character varying(255) NOT NULL,
    description text NOT NULL,
    priority character varying(20) DEFAULT 'normal'::character varying,
    type character varying(50) DEFAULT 'text'::character varying,
    status character varying(50) DEFAULT 'open'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    assigned_at timestamp with time zone,
    resolved_at timestamp with time zone,
    closed_at timestamp with time zone,
    created_by_agent_id uuid,
    CONSTRAINT support_tickets_priority_check CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'normal'::character varying, 'high'::character varying, 'urgent'::character varying])::text[]))),
    CONSTRAINT support_tickets_status_check CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'in_progress'::character varying, 'pending_customer'::character varying, 'resolved'::character varying, 'closed'::character varying])::text[]))),
    CONSTRAINT support_tickets_type_check CHECK (((type)::text = ANY ((ARRAY['text'::character varying, 'voice_call'::character varying])::text[])))
);


ALTER TABLE public.support_tickets OWNER TO avnadmin;

--
-- TOC entry 232 (class 1259 OID 16824)
-- Name: ticket_assignments; Type: TABLE; Schema: public; Owner: avnadmin
--

CREATE TABLE public.ticket_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    agent_id uuid,
    assigned_by uuid,
    assignment_type character varying(20),
    assigned_at timestamp with time zone DEFAULT now(),
    unassigned_at timestamp with time zone,
    CONSTRAINT ticket_assignments_assignment_type_check CHECK (((assignment_type)::text = ANY ((ARRAY['automatic'::character varying, 'manual'::character varying])::text[])))
);


ALTER TABLE public.ticket_assignments OWNER TO avnadmin;

--
-- TOC entry 230 (class 1259 OID 16792)
-- Name: ticket_messages; Type: TABLE; Schema: public; Owner: avnadmin
--

CREATE TABLE public.ticket_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    sender_type character varying(20) NOT NULL,
    message text NOT NULL,
    is_internal boolean DEFAULT false,
    attachments jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT ticket_messages_sender_type_check CHECK (((sender_type)::text = ANY ((ARRAY['customer'::character varying, 'agent'::character varying])::text[])))
);


ALTER TABLE public.ticket_messages OWNER TO avnadmin;

--
-- TOC entry 224 (class 1259 OID 16512)
-- Name: transactions; Type: TABLE; Schema: public; Owner: avnadmin
--

CREATE TABLE public.transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wallet_id uuid NOT NULL,
    ride_id uuid,
    amount numeric(10,2) NOT NULL,
    type character varying(50) NOT NULL,
    status character varying(50) NOT NULL,
    gateway_transaction_id character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_settled boolean DEFAULT false NOT NULL,
    CONSTRAINT transactions_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('successful'::character varying)::text, ('failed'::character varying)::text]))),
    CONSTRAINT transactions_type_check CHECK (((type)::text = ANY (ARRAY[('ride_payment'::character varying)::text, ('wallet_recharge'::character varying)::text, ('fine'::character varying)::text, ('payout'::character varying)::text, ('refund'::character varying)::text])))
);


ALTER TABLE public.transactions OWNER TO avnadmin;

--
-- TOC entry 218 (class 1259 OID 16468)
-- Name: users; Type: TABLE; Schema: public; Owner: avnadmin
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone_number character varying(20) NOT NULL,
    full_name character varying(255),
    email character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    date_of_birth date,
    gender character varying(50),
    home_address text,
    home_latitude numeric(9,6),
    home_longitude numeric(9,6),
    work_address text,
    work_latitude numeric(9,6),
    work_longitude numeric(9,6)
);


ALTER TABLE public.users OWNER TO avnadmin;

--
-- TOC entry 223 (class 1259 OID 16507)
-- Name: wallets; Type: TABLE; Schema: public; Owner: avnadmin
--

CREATE TABLE public.wallets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    balance numeric(10,2) DEFAULT 0.00 NOT NULL
);


ALTER TABLE public.wallets OWNER TO avnadmin;

--
-- TOC entry 4460 (class 2606 OID 16818)
-- Name: agent_status agent_status_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.agent_status
    ADD CONSTRAINT agent_status_pkey PRIMARY KEY (agent_id);


--
-- TOC entry 4443 (class 2606 OID 16568)
-- Name: driver_actions driver_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_actions
    ADD CONSTRAINT driver_actions_pkey PRIMARY KEY (id);


--
-- TOC entry 4423 (class 2606 OID 16552)
-- Name: driver_documents driver_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_documents
    ADD CONSTRAINT driver_documents_pkey PRIMARY KEY (id);


--
-- TOC entry 4439 (class 2606 OID 16562)
-- Name: driver_ledger driver_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_ledger
    ADD CONSTRAINT driver_ledger_pkey PRIMARY KEY (id);


--
-- TOC entry 4441 (class 2606 OID 16564)
-- Name: driver_payouts driver_payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_payouts
    ADD CONSTRAINT driver_payouts_pkey PRIMARY KEY (id);


--
-- TOC entry 4425 (class 2606 OID 16576)
-- Name: driver_vehicles driver_vehicles_driver_id_key; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_vehicles
    ADD CONSTRAINT driver_vehicles_driver_id_key UNIQUE (driver_id);


--
-- TOC entry 4427 (class 2606 OID 16554)
-- Name: driver_vehicles driver_vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_vehicles
    ADD CONSTRAINT driver_vehicles_pkey PRIMARY KEY (id);


--
-- TOC entry 4429 (class 2606 OID 16578)
-- Name: driver_vehicles driver_vehicles_registration_number_key; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_vehicles
    ADD CONSTRAINT driver_vehicles_registration_number_key UNIQUE (registration_number);


--
-- TOC entry 4419 (class 2606 OID 16550)
-- Name: drivers drivers_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_pkey PRIMARY KEY (id);


--
-- TOC entry 4421 (class 2606 OID 16574)
-- Name: drivers drivers_user_id_key; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_user_id_key UNIQUE (user_id);


--
-- TOC entry 4445 (class 2606 OID 16738)
-- Name: platform_staff platform_staff_email_key; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.platform_staff
    ADD CONSTRAINT platform_staff_email_key UNIQUE (email);


--
-- TOC entry 4447 (class 2606 OID 16736)
-- Name: platform_staff platform_staff_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.platform_staff
    ADD CONSTRAINT platform_staff_pkey PRIMARY KEY (id);


--
-- TOC entry 4431 (class 2606 OID 16556)
-- Name: rides rides_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.rides
    ADD CONSTRAINT rides_pkey PRIMARY KEY (id);


--
-- TOC entry 4468 (class 2606 OID 16872)
-- Name: servicable_cities servicable_cities_city_name_key; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.servicable_cities
    ADD CONSTRAINT servicable_cities_city_name_key UNIQUE (city_name);


--
-- TOC entry 4470 (class 2606 OID 16870)
-- Name: servicable_cities servicable_cities_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.servicable_cities
    ADD CONSTRAINT servicable_cities_pkey PRIMARY KEY (id);


--
-- TOC entry 4454 (class 2606 OID 16776)
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- TOC entry 4466 (class 2606 OID 16831)
-- Name: ticket_assignments ticket_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.ticket_assignments
    ADD CONSTRAINT ticket_assignments_pkey PRIMARY KEY (id);


--
-- TOC entry 4458 (class 2606 OID 16802)
-- Name: ticket_messages ticket_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.ticket_messages
    ADD CONSTRAINT ticket_messages_pkey PRIMARY KEY (id);


--
-- TOC entry 4437 (class 2606 OID 16560)
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- TOC entry 4413 (class 2606 OID 16572)
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- TOC entry 4415 (class 2606 OID 16570)
-- Name: users users_phone_number_key; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_phone_number_key UNIQUE (phone_number);


--
-- TOC entry 4417 (class 2606 OID 16548)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 4433 (class 2606 OID 16558)
-- Name: wallets wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);


--
-- TOC entry 4435 (class 2606 OID 16580)
-- Name: wallets wallets_user_id_key; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_user_id_key UNIQUE (user_id);


--
-- TOC entry 4461 (class 1259 OID 16855)
-- Name: idx_agent_status_active_tickets; Type: INDEX; Schema: public; Owner: avnadmin
--

CREATE INDEX idx_agent_status_active_tickets ON public.agent_status USING btree (active_tickets_count);


--
-- TOC entry 4462 (class 1259 OID 16854)
-- Name: idx_agent_status_status; Type: INDEX; Schema: public; Owner: avnadmin
--

CREATE INDEX idx_agent_status_status ON public.agent_status USING btree (status);


--
-- TOC entry 4448 (class 1259 OID 16849)
-- Name: idx_support_tickets_assigned_agent; Type: INDEX; Schema: public; Owner: avnadmin
--

CREATE INDEX idx_support_tickets_assigned_agent ON public.support_tickets USING btree (assigned_agent_id);


--
-- TOC entry 4449 (class 1259 OID 16847)
-- Name: idx_support_tickets_city; Type: INDEX; Schema: public; Owner: avnadmin
--

CREATE INDEX idx_support_tickets_city ON public.support_tickets USING btree (city);


--
-- TOC entry 4450 (class 1259 OID 16851)
-- Name: idx_support_tickets_created_at; Type: INDEX; Schema: public; Owner: avnadmin
--

CREATE INDEX idx_support_tickets_created_at ON public.support_tickets USING btree (created_at);


--
-- TOC entry 4451 (class 1259 OID 16850)
-- Name: idx_support_tickets_priority; Type: INDEX; Schema: public; Owner: avnadmin
--

CREATE INDEX idx_support_tickets_priority ON public.support_tickets USING btree (priority);


--
-- TOC entry 4452 (class 1259 OID 16848)
-- Name: idx_support_tickets_status; Type: INDEX; Schema: public; Owner: avnadmin
--

CREATE INDEX idx_support_tickets_status ON public.support_tickets USING btree (status);


--
-- TOC entry 4463 (class 1259 OID 16857)
-- Name: idx_ticket_assignments_agent_id; Type: INDEX; Schema: public; Owner: avnadmin
--

CREATE INDEX idx_ticket_assignments_agent_id ON public.ticket_assignments USING btree (agent_id);


--
-- TOC entry 4464 (class 1259 OID 16856)
-- Name: idx_ticket_assignments_ticket_id; Type: INDEX; Schema: public; Owner: avnadmin
--

CREATE INDEX idx_ticket_assignments_ticket_id ON public.ticket_assignments USING btree (ticket_id);


--
-- TOC entry 4455 (class 1259 OID 16853)
-- Name: idx_ticket_messages_created_at; Type: INDEX; Schema: public; Owner: avnadmin
--

CREATE INDEX idx_ticket_messages_created_at ON public.ticket_messages USING btree (created_at);


--
-- TOC entry 4456 (class 1259 OID 16852)
-- Name: idx_ticket_messages_ticket_id; Type: INDEX; Schema: public; Owner: avnadmin
--

CREATE INDEX idx_ticket_messages_ticket_id ON public.ticket_messages USING btree (ticket_id);


--
-- TOC entry 4493 (class 2620 OID 16859)
-- Name: support_tickets trigger_update_agent_ticket_count; Type: TRIGGER; Schema: public; Owner: avnadmin
--

CREATE TRIGGER trigger_update_agent_ticket_count AFTER INSERT OR UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.update_agent_ticket_count();


--
-- TOC entry 4489 (class 2606 OID 16819)
-- Name: agent_status agent_status_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.agent_status
    ADD CONSTRAINT agent_status_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.platform_staff(id) ON DELETE CASCADE;


--
-- TOC entry 4482 (class 2606 OID 16641)
-- Name: driver_actions driver_actions_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_actions
    ADD CONSTRAINT driver_actions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.users(id);


--
-- TOC entry 4483 (class 2606 OID 16646)
-- Name: driver_actions driver_actions_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_actions
    ADD CONSTRAINT driver_actions_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);


--
-- TOC entry 4472 (class 2606 OID 16586)
-- Name: driver_documents driver_documents_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_documents
    ADD CONSTRAINT driver_documents_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);


--
-- TOC entry 4479 (class 2606 OID 16621)
-- Name: driver_ledger driver_ledger_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_ledger
    ADD CONSTRAINT driver_ledger_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);


--
-- TOC entry 4480 (class 2606 OID 16626)
-- Name: driver_ledger driver_ledger_ride_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_ledger
    ADD CONSTRAINT driver_ledger_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id);


--
-- TOC entry 4481 (class 2606 OID 16631)
-- Name: driver_payouts driver_payouts_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_payouts
    ADD CONSTRAINT driver_payouts_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);


--
-- TOC entry 4473 (class 2606 OID 16591)
-- Name: driver_vehicles driver_vehicles_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_vehicles
    ADD CONSTRAINT driver_vehicles_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);


--
-- TOC entry 4471 (class 2606 OID 16581)
-- Name: drivers drivers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- TOC entry 4484 (class 2606 OID 16746)
-- Name: platform_staff platform_staff_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.platform_staff
    ADD CONSTRAINT platform_staff_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.platform_staff(id);


--
-- TOC entry 4474 (class 2606 OID 16596)
-- Name: rides rides_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.rides
    ADD CONSTRAINT rides_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.users(id);


--
-- TOC entry 4475 (class 2606 OID 16601)
-- Name: rides rides_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.rides
    ADD CONSTRAINT rides_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);


--
-- TOC entry 4485 (class 2606 OID 16782)
-- Name: support_tickets support_tickets_assigned_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_assigned_agent_id_fkey FOREIGN KEY (assigned_agent_id) REFERENCES public.platform_staff(id);


--
-- TOC entry 4486 (class 2606 OID 16787)
-- Name: support_tickets support_tickets_created_by_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_created_by_agent_id_fkey FOREIGN KEY (created_by_agent_id) REFERENCES public.platform_staff(id);


--
-- TOC entry 4487 (class 2606 OID 16777)
-- Name: support_tickets support_tickets_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.users(id);


--
-- TOC entry 4490 (class 2606 OID 16837)
-- Name: ticket_assignments ticket_assignments_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.ticket_assignments
    ADD CONSTRAINT ticket_assignments_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.platform_staff(id);


--
-- TOC entry 4491 (class 2606 OID 16842)
-- Name: ticket_assignments ticket_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.ticket_assignments
    ADD CONSTRAINT ticket_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.platform_staff(id);


--
-- TOC entry 4492 (class 2606 OID 16832)
-- Name: ticket_assignments ticket_assignments_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.ticket_assignments
    ADD CONSTRAINT ticket_assignments_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- TOC entry 4488 (class 2606 OID 16803)
-- Name: ticket_messages ticket_messages_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.ticket_messages
    ADD CONSTRAINT ticket_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- TOC entry 4477 (class 2606 OID 16616)
-- Name: transactions transactions_ride_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id);


--
-- TOC entry 4478 (class 2606 OID 16611)
-- Name: transactions transactions_wallet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES public.wallets(id);


--
-- TOC entry 4476 (class 2606 OID 16606)
-- Name: wallets wallets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


-- Completed on 2025-09-27 13:13:07

--
-- PostgreSQL database dump complete
--

\unrestrict 7Jgl6dBHbTsH1T7jFyZ8aqUzD3MdvMumSRkOWdGHxlH3fKSHGJEFrpsPV9UKsM3

