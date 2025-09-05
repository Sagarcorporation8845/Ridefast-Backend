--
-- PostgreSQL database dump
--

\restrict WPCW6mAE67xAUUrk3s94FM8HOUsIt7AYUznckeJi45Stgm8tIB7EAPDnxZ9KBtc

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

-- Started on 2025-09-02 10:41:47

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
-- TOC entry 4561 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 228 (class 1259 OID 16539)
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
    CONSTRAINT driver_vehicles_fuel_type_check CHECK (((fuel_type)::text = ANY (ARRAY[('petrol'::character varying)::text, ('diesel'::character varying)::text, ('electric'::character varying)::text, ('cng'::character varying)::text])))
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
-- TOC entry 227 (class 1259 OID 16532)
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: avnadmin
--

CREATE TABLE public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_by_agent_id uuid NOT NULL,
    subject character varying(255) NOT NULL,
    status character varying(50) DEFAULT 'open'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT support_tickets_status_check CHECK (((status)::text = ANY (ARRAY[('open'::character varying)::text, ('pending_admin'::character varying)::text, ('resolved'::character varying)::text])))
);


ALTER TABLE public.support_tickets OWNER TO avnadmin;

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
-- TOC entry 4396 (class 2606 OID 16568)
-- Name: driver_actions driver_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_actions
    ADD CONSTRAINT driver_actions_pkey PRIMARY KEY (id);


--
-- TOC entry 4374 (class 2606 OID 16552)
-- Name: driver_documents driver_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_documents
    ADD CONSTRAINT driver_documents_pkey PRIMARY KEY (id);


--
-- TOC entry 4390 (class 2606 OID 16562)
-- Name: driver_ledger driver_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_ledger
    ADD CONSTRAINT driver_ledger_pkey PRIMARY KEY (id);


--
-- TOC entry 4392 (class 2606 OID 16564)
-- Name: driver_payouts driver_payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_payouts
    ADD CONSTRAINT driver_payouts_pkey PRIMARY KEY (id);


--
-- TOC entry 4376 (class 2606 OID 16576)
-- Name: driver_vehicles driver_vehicles_driver_id_key; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_vehicles
    ADD CONSTRAINT driver_vehicles_driver_id_key UNIQUE (driver_id);


--
-- TOC entry 4378 (class 2606 OID 16554)
-- Name: driver_vehicles driver_vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_vehicles
    ADD CONSTRAINT driver_vehicles_pkey PRIMARY KEY (id);


--
-- TOC entry 4380 (class 2606 OID 16578)
-- Name: driver_vehicles driver_vehicles_registration_number_key; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_vehicles
    ADD CONSTRAINT driver_vehicles_registration_number_key UNIQUE (registration_number);


--
-- TOC entry 4370 (class 2606 OID 16550)
-- Name: drivers drivers_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_pkey PRIMARY KEY (id);


--
-- TOC entry 4372 (class 2606 OID 16574)
-- Name: drivers drivers_user_id_key; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_user_id_key UNIQUE (user_id);


--
-- TOC entry 4382 (class 2606 OID 16556)
-- Name: rides rides_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.rides
    ADD CONSTRAINT rides_pkey PRIMARY KEY (id);


--
-- TOC entry 4394 (class 2606 OID 16566)
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- TOC entry 4388 (class 2606 OID 16560)
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- TOC entry 4364 (class 2606 OID 16572)
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- TOC entry 4366 (class 2606 OID 16570)
-- Name: users users_phone_number_key; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_phone_number_key UNIQUE (phone_number);


--
-- TOC entry 4368 (class 2606 OID 16548)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 4384 (class 2606 OID 16558)
-- Name: wallets wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);


--
-- TOC entry 4386 (class 2606 OID 16580)
-- Name: wallets wallets_user_id_key; Type: CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_user_id_key UNIQUE (user_id);


--
-- TOC entry 4409 (class 2606 OID 16641)
-- Name: driver_actions driver_actions_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_actions
    ADD CONSTRAINT driver_actions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.users(id);


--
-- TOC entry 4410 (class 2606 OID 16646)
-- Name: driver_actions driver_actions_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_actions
    ADD CONSTRAINT driver_actions_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);


--
-- TOC entry 4398 (class 2606 OID 16586)
-- Name: driver_documents driver_documents_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_documents
    ADD CONSTRAINT driver_documents_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);


--
-- TOC entry 4405 (class 2606 OID 16621)
-- Name: driver_ledger driver_ledger_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_ledger
    ADD CONSTRAINT driver_ledger_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);


--
-- TOC entry 4406 (class 2606 OID 16626)
-- Name: driver_ledger driver_ledger_ride_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_ledger
    ADD CONSTRAINT driver_ledger_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id);


--
-- TOC entry 4407 (class 2606 OID 16631)
-- Name: driver_payouts driver_payouts_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_payouts
    ADD CONSTRAINT driver_payouts_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);


--
-- TOC entry 4399 (class 2606 OID 16591)
-- Name: driver_vehicles driver_vehicles_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.driver_vehicles
    ADD CONSTRAINT driver_vehicles_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);


--
-- TOC entry 4397 (class 2606 OID 16581)
-- Name: drivers drivers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- TOC entry 4400 (class 2606 OID 16596)
-- Name: rides rides_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.rides
    ADD CONSTRAINT rides_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.users(id);


--
-- TOC entry 4401 (class 2606 OID 16601)
-- Name: rides rides_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.rides
    ADD CONSTRAINT rides_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);


--
-- TOC entry 4408 (class 2606 OID 16636)
-- Name: support_tickets support_tickets_created_by_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_created_by_agent_id_fkey FOREIGN KEY (created_by_agent_id) REFERENCES public.users(id);


--
-- TOC entry 4403 (class 2606 OID 16616)
-- Name: transactions transactions_ride_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id);


--
-- TOC entry 4404 (class 2606 OID 16611)
-- Name: transactions transactions_wallet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES public.wallets(id);


--
-- TOC entry 4402 (class 2606 OID 16606)
-- Name: wallets wallets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: avnadmin
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


-- Completed on 2025-09-02 10:43:00

--
-- PostgreSQL database dump complete
--

\unrestrict WPCW6mAE67xAUUrk3s94FM8HOUsIt7AYUznckeJi45Stgm8tIB7EAPDnxZ9KBtc

