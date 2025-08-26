-- =================================================================
-- RideFast Platform: Complete Database Schema
-- =================================================================

--
-- Step 1: Enable the required extension for UUID generation
--
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

--
-- Table: users
-- Stores core information for all individuals (customers, drivers, agents).
--
CREATE TABLE public.users (
    id uuid DEFAULT uuid_generate_v4() NOT NULL, -- Corrected UUID function
    phone_number character varying(20) NOT NULL,
    full_name character varying(255),
    email character varying(255),
    role character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['customer'::character varying, 'driver'::character varying, 'agent'::character varying, 'admin'::character varying])::text[])))
);

--
-- Table: drivers
-- Stores driver-specific information, linked to a user account.
--
CREATE TABLE public.drivers (
    id uuid DEFAULT uuid_generate_v4() NOT NULL, -- Corrected UUID function
    user_id uuid NOT NULL,
    city character varying(100),
    status character varying(50) DEFAULT 'pending_verification'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT drivers_status_check CHECK (((status)::text = ANY ((ARRAY['pending_verification'::character varying, 'active'::character varying, 'suspended'::character varying])::text[])))
);

--
-- Table: driver_documents
-- Stores URLs and status for uploaded driver documents.
--
CREATE TABLE public.driver_documents (
    id uuid DEFAULT uuid_generate_v4() NOT NULL, -- Corrected UUID function
    driver_id uuid NOT NULL,
    document_type character varying(50) NOT NULL,
    file_url character varying(255) NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    rejection_reason text,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT driver_documents_document_type_check CHECK (((document_type)::text = ANY ((ARRAY['license'::character varying, 'rc'::character varying, 'photo'::character varying, 'aadhaar'::character varying])::text[]))),
    CONSTRAINT driver_documents_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])))
);

--
-- Table: driver_vehicles
-- Stores details about a driver's registered vehicle.
--
CREATE TABLE public.driver_vehicles (
    id uuid DEFAULT uuid_generate_v4() NOT NULL, -- Corrected UUID function
    driver_id uuid NOT NULL,
    model_name character varying(255) NOT NULL,
    registration_number character varying(20) NOT NULL,
    category character varying(50) NOT NULL,
    fuel_type character varying(50) NOT NULL,
    CONSTRAINT driver_vehicles_category_check CHECK (((category)::text = ANY ((ARRAY['bike'::character varying, 'auto'::character varying, 'mini'::character varying, 'sedan'::character varying, 'suv'::character varying])::text[]))),
    CONSTRAINT driver_vehicles_fuel_type_check CHECK (((fuel_type)::text = ANY ((ARRAY['petrol'::character varying, 'diesel'::character varying, 'electric'::character varying, 'cng'::character varying])::text[])))
);

--
-- Table: rides
-- The core table for managing all ride and parcel bookings.
--
CREATE TABLE public.rides (
    id uuid DEFAULT uuid_generate_v4() NOT NULL, -- Corrected UUID function
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
    CONSTRAINT rides_status_check CHECK (((status)::text = ANY ((ARRAY['requested'::character varying, 'accepted'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[])))
);

--
-- Table: wallets
-- Stores the current balance for each user.
--
CREATE TABLE public.wallets (
    id uuid DEFAULT uuid_generate_v4() NOT NULL, -- Corrected UUID function
    user_id uuid NOT NULL,
    balance numeric(10,2) DEFAULT 0.00 NOT NULL
);

--
-- Table: transactions
-- A log of all financial transactions (payments, recharges, refunds).
--
CREATE TABLE public.transactions (
    id uuid DEFAULT uuid_generate_v4() NOT NULL, -- Corrected UUID function
    wallet_id uuid NOT NULL,
    ride_id uuid,
    amount numeric(10,2) NOT NULL,
    type character varying(50) NOT NULL,
    status character varying(50) NOT NULL,
    gateway_transaction_id character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_settled boolean DEFAULT false NOT NULL,
    CONSTRAINT transactions_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'successful'::character varying, 'failed'::character varying])::text[]))),
    CONSTRAINT transactions_type_check CHECK (((type)::text = ANY ((ARRAY['ride_payment'::character varying, 'wallet_recharge'::character varying, 'fine'::character varying, 'payout'::character varying, 'refund'::character varying])::text[])))
);

--
-- Table: driver_ledger
-- A detailed ledger for all driver-related financial events.
--
CREATE TABLE public.driver_ledger (
    id uuid DEFAULT uuid_generate_v4() NOT NULL, -- Corrected UUID function
    driver_id uuid NOT NULL,
    ride_id uuid,
    amount numeric(10,2) NOT NULL,
    type character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT driver_ledger_type_check CHECK (((type)::text = ANY ((ARRAY['ride_earning'::character varying, 'platform_fee'::character varying, 'tip'::character varying, 'fine'::character varying, 'incentive'::character varying, 'cash_collected'::character varying])::text[])))
);

--
-- Table: driver_payouts
-- A log of all settlement payouts made to drivers.
--
CREATE TABLE public.driver_payouts (
    id uuid DEFAULT uuid_generate_v4() NOT NULL, -- Corrected UUID function
    driver_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    status character varying(50) NOT NULL,
    settlement_period_start timestamp with time zone NOT NULL,
    settlement_period_end timestamp with time zone NOT NULL,
    gateway_payout_id character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT driver_payouts_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])))
);

--
-- Table: support_tickets
-- Stores tickets raised by support agents.
--
CREATE TABLE public.support_tickets (
    id uuid DEFAULT uuid_generate_v4() NOT NULL, -- Corrected UUID function
    created_by_agent_id uuid NOT NULL,
    subject character varying(255) NOT NULL,
    status character varying(50) DEFAULT 'open'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT support_tickets_status_check CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'pending_admin'::character varying, 'resolved'::character varying])::text[])))
);

--
-- Table: driver_actions
-- A log of all disciplinary actions taken against drivers.
--
CREATE TABLE public.driver_actions (
    id uuid DEFAULT uuid_generate_v4() NOT NULL, -- Corrected UUID function
    driver_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    action_type character varying(50) NOT NULL,
    reason text NOT NULL,
    fine_amount numeric(10,2),
    suspension_duration character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT driver_actions_action_type_check CHECK (((action_type)::text = ANY ((ARRAY['warning'::character varying, 'fine'::character varying, 'suspension'::character varying])::text[])))
);


-- =================================================================
-- PRIMARY KEYS
-- =================================================================

ALTER TABLE ONLY public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.drivers ADD CONSTRAINT drivers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.driver_documents ADD CONSTRAINT driver_documents_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.driver_vehicles ADD CONSTRAINT driver_vehicles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.rides ADD CONSTRAINT rides_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.wallets ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.driver_ledger ADD CONSTRAINT driver_ledger_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.driver_payouts ADD CONSTRAINT driver_payouts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.support_tickets ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.driver_actions ADD CONSTRAINT driver_actions_pkey PRIMARY KEY (id);


-- =================================================================
-- UNIQUE CONSTRAINTS
-- =================================================================

ALTER TABLE ONLY public.users ADD CONSTRAINT users_phone_number_key UNIQUE (phone_number);
ALTER TABLE ONLY public.users ADD CONSTRAINT users_email_key UNIQUE (email);
ALTER TABLE ONLY public.drivers ADD CONSTRAINT drivers_user_id_key UNIQUE (user_id);
ALTER TABLE ONLY public.driver_vehicles ADD CONSTRAINT driver_vehicles_driver_id_key UNIQUE (driver_id);
ALTER TABLE ONLY public.driver_vehicles ADD CONSTRAINT driver_vehicles_registration_number_key UNIQUE (registration_number);
ALTER TABLE ONLY public.wallets ADD CONSTRAINT wallets_user_id_key UNIQUE (user_id);


-- =================================================================
-- FOREIGN KEYS
-- =================================================================

ALTER TABLE ONLY public.drivers ADD CONSTRAINT drivers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.driver_documents ADD CONSTRAINT driver_documents_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);
ALTER TABLE ONLY public.driver_vehicles ADD CONSTRAINT driver_vehicles_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);
ALTER TABLE ONLY public.rides ADD CONSTRAINT rides_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.rides ADD CONSTRAINT rides_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);
ALTER TABLE ONLY public.wallets ADD CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES public.wallets(id);
ALTER TABLE ONLY public.transactions ADD CONSTRAINT transactions_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id);
ALTER TABLE ONLY public.driver_ledger ADD CONSTRAINT driver_ledger_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);
ALTER TABLE ONLY public.driver_ledger ADD CONSTRAINT driver_ledger_ride_id_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id);
ALTER TABLE ONLY public.driver_payouts ADD CONSTRAINT driver_payouts_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);
ALTER TABLE ONLY public.support_tickets ADD CONSTRAINT support_tickets_created_by_agent_id_fkey FOREIGN KEY (created_by_agent_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.driver_actions ADD CONSTRAINT driver_actions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.users(id);
ALTER TABLE ONLY public.driver_actions ADD CONSTRAINT driver_actions_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);

-- new update 
ALTER TABLE public.users ADD COLUMN date_of_birth DATE;

ALTER TABLE public.users ADD COLUMN gender VARCHAR(50);

-- =================================================================
-- Add Saved Locations to Users Table
-- =================================================================

ALTER TABLE public.users 
ADD COLUMN home_address TEXT,
ADD COLUMN home_latitude NUMERIC(9,6),
ADD COLUMN home_longitude NUMERIC(9,6),
ADD COLUMN work_address TEXT,
ADD COLUMN work_latitude NUMERIC(9,6),
ADD COLUMN work_longitude NUMERIC(9,6);