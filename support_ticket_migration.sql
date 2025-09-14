-- Support Ticket Management System Database Migration
-- Run this script on your PostgreSQL database

-- Drop existing support_tickets table if it exists (since we're enhancing it)
DROP TABLE IF EXISTS support_tickets CASCADE;

-- Enhanced support tickets table
CREATE TABLE support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id),
    assigned_agent_id UUID REFERENCES platform_staff(id),
    city VARCHAR(100) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    type VARCHAR(50) DEFAULT 'text' CHECK (type IN ('text', 'voice_call')),
    status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'pending_customer', 'resolved', 'closed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assigned_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    created_by_agent_id UUID REFERENCES platform_staff(id)
);

-- Ticket communication thread
CREATE TABLE ticket_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL, -- Can be customer (users table) or agent (platform_staff table)
    sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('customer', 'agent')),
    message TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT FALSE,
    attachments JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agent status tracking
CREATE TABLE agent_status (
    agent_id UUID PRIMARY KEY REFERENCES platform_staff(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'busy')),
    active_tickets_count INTEGER DEFAULT 0 CHECK (active_tickets_count >= 0 AND active_tickets_count <= 2),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ticket assignment history for audit trail
CREATE TABLE ticket_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES platform_staff(id),
    assigned_by UUID REFERENCES platform_staff(id),
    assignment_type VARCHAR(20) CHECK (assignment_type IN ('automatic', 'manual')),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    unassigned_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for better performance
CREATE INDEX idx_support_tickets_city ON support_tickets(city);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);
CREATE INDEX idx_support_tickets_assigned_agent ON support_tickets(assigned_agent_id);
CREATE INDEX idx_support_tickets_priority ON support_tickets(priority);
CREATE INDEX idx_support_tickets_created_at ON support_tickets(created_at);

CREATE INDEX idx_ticket_messages_ticket_id ON ticket_messages(ticket_id);
CREATE INDEX idx_ticket_messages_created_at ON ticket_messages(created_at);

CREATE INDEX idx_agent_status_status ON agent_status(status);
CREATE INDEX idx_agent_status_active_tickets ON agent_status(active_tickets_count);

CREATE INDEX idx_ticket_assignments_ticket_id ON ticket_assignments(ticket_id);
CREATE INDEX idx_ticket_assignments_agent_id ON ticket_assignments(agent_id);

-- Create trigger to automatically update agent status when tickets are assigned/unassigned
CREATE OR REPLACE FUNCTION update_agent_ticket_count()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER trigger_update_agent_ticket_count
    AFTER INSERT OR UPDATE ON support_tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_agent_ticket_count();

-- Insert initial agent status for existing platform staff with support role
INSERT INTO agent_status (agent_id, status, active_tickets_count)
SELECT id, 'offline', 0 
FROM platform_staff 
WHERE role = 'support'
ON CONFLICT (agent_id) DO NOTHING;

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON support_tickets TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ticket_messages TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON agent_status TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ticket_assignments TO your_app_user;