-- Dummy Support Tickets for Testing
-- 15 tickets distributed between Pune and Mumbai

-- Pune Tickets (8 tickets)
INSERT INTO support_tickets (id, customer_id, city, subject, description, priority, type, status, created_at, created_by_agent_id) VALUES
-- High Priority Ticket
('11111111-1111-1111-1111-111111111111', 'ece6a637-1c98-4eef-8943-8d0426def367', 'Pune', 'Ride Cancelled Without Reason', 'My ride was cancelled by driver without any explanation. I was waiting for 15 minutes and then it got cancelled. Very frustrating experience.', 'high', 'text', 'open', NOW() - INTERVAL '2 hours', 'f24bddd1-72d0-403b-8507-3b758f6af938'),

-- Normal Priority Tickets
('22222222-2222-2222-2222-222222222222', '33c74ce6-87fb-4072-8a0a-c2786c9c431f', 'Pune', 'Driver Took Wrong Route', 'Driver took a longer route and charged extra fare. This is unfair pricing.', 'normal', 'text', 'open', NOW() - INTERVAL '4 hours', 'f24bddd1-72d0-403b-8507-3b758f6af938'),

('33333333-3333-3333-3333-333333333333', '9c58a742-39ca-427d-9cfc-e7345360d21d', 'Pune', 'Payment Issue - Double Charged', 'I was charged twice for the same ride. Please refund the duplicate charge.', 'high', 'text', 'in_progress', NOW() - INTERVAL '6 hours', 'f24bddd1-72d0-403b-8507-3b758f6af938'),

('44444444-4444-4444-4444-444444444444', 'cbdff865-cf7e-44b4-a5e1-0db760590210', 'Pune', 'Driver Was Rude', 'The driver was very rude and unprofessional. He was talking on phone while driving and not following traffic rules.', 'normal', 'text', 'pending_customer', NOW() - INTERVAL '1 day', 'f24bddd1-72d0-403b-8507-3b758f6af938'),

('55555555-5555-5555-5555-555555555555', '78f3aa77-6471-4f6b-986f-94f2a3fd0e0e', 'Pune', 'App Not Working Properly', 'The app keeps crashing when I try to book a ride. This has been happening for 2 days now.', 'normal', 'text', 'open', NOW() - INTERVAL '1 day 2 hours', 'f24bddd1-72d0-403b-8507-3b758f6af938'),

('66666666-6666-6666-6666-666666666666', '466b8b50-2f8f-47d4-8d50-0c40a49e2893', 'Pune', 'Late Pickup', 'Driver was 25 minutes late for pickup. This made me miss my important meeting.', 'normal', 'text', 'resolved', NOW() - INTERVAL '2 days', 'f24bddd1-72d0-403b-8507-3b758f6af938'),

('77777777-7777-7777-7777-777777777777', '43e544c8-1696-4c95-963d-b8491f9791a1', 'Pune', 'Vehicle Condition Poor', 'The vehicle was not clean and had a bad smell. The seats were torn and uncomfortable.', 'low', 'text', 'open', NOW() - INTERVAL '3 days', 'f24bddd1-72d0-403b-8507-3b758f6af938'),

('88888888-8888-8888-8888-888888888888', '498a5766-24ad-4446-9747-f75141e5f1b4', 'Pune', 'Fare Calculation Error', 'The fare shown in app was Rs. 150 but I was charged Rs. 200. Please check and refund the difference.', 'high', 'text', 'in_progress', NOW() - INTERVAL '4 days', 'f24bddd1-72d0-403b-8507-3b758f6af938');

-- Mumbai Tickets (7 tickets)
INSERT INTO support_tickets (id, customer_id, city, subject, description, priority, type, status, created_at, created_by_agent_id) VALUES
-- Urgent Priority Ticket
('99999999-9999-9999-9999-999999999999', '0e60fcba-d990-4e04-8e86-b0b8511d1234', 'Mumbai', 'Emergency Ride Needed - Driver No Show', 'I had an emergency and booked a ride but driver never came. This could have been life-threatening situation.', 'urgent', 'voice_call', 'open', NOW() - INTERVAL '1 hour', 'd3d198d2-5eac-4a75-9776-e4b89203acff'),

-- High Priority Tickets
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '518c826a-f5a0-4d48-a1b6-abc4c3d50343', 'Mumbai', 'Driver Asked for Cash Payment', 'Driver demanded cash payment instead of app payment. This is against your policy.', 'high', 'text', 'open', NOW() - INTERVAL '3 hours', 'd3d198d2-5eac-4a75-9776-e4b89203acff'),

('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cbdff865-cf7e-44b4-a5e1-0db760590210', 'Mumbai', 'Safety Concern - Reckless Driving', 'Driver was driving very dangerously, overspeeding and jumping red lights. I felt unsafe throughout the ride.', 'high', 'text', 'pending_customer', NOW() - INTERVAL '5 hours', 'd3d198d2-5eac-4a75-9776-e4b89203acff'),

-- Normal Priority Tickets
('cccccccc-cccc-cccc-cccc-cccccccccccc', '78f3aa77-6471-4f6b-986f-94f2a3fd0e0e', 'Mumbai', 'App Login Issues', 'Cannot login to the app. Getting error message every time I try to login with my phone number.', 'normal', 'text', 'open', NOW() - INTERVAL '1 day', 'd3d198d2-5eac-4a75-9776-e4b89203acff'),

('dddddddd-dddd-dddd-dddd-dddddddddddd', '466b8b50-2f8f-47d4-8d50-0c40a49e2893', 'Mumbai', 'Driver Cancelled After Waiting', 'I waited for 20 minutes and then driver cancelled the ride. No explanation given.', 'normal', 'text', 'resolved', NOW() - INTERVAL '2 days', 'd3d198d2-5eac-4a75-9776-e4b89203acff'),

('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '43e544c8-1696-4c95-963d-b8491f9791a1', 'Mumbai', 'Wrong Drop Location', 'Driver dropped me at wrong location. I had to walk 2 km to reach my actual destination.', 'normal', 'text', 'in_progress', NOW() - INTERVAL '3 days', 'd3d198d2-5eac-4a75-9776-e4b89203acff'),

('ffffffff-ffff-ffff-ffff-ffffffffffff', '498a5766-24ad-4446-9747-f75141e5f1b4', 'Mumbai', 'Rating System Not Working', 'I cannot rate my driver after the ride. The rating buttons are not clickable.', 'low', 'text', 'open', NOW() - INTERVAL '5 days', 'd3d198d2-5eac-4a75-9776-e4b89203acff');

-- Assign some tickets to agents (simulate assignment) - Only assign 2 tickets to respect the constraint
UPDATE support_tickets 
SET assigned_agent_id = 'eb4d82ae-9bc5-40a1-8c68-61f5b8f9613a', 
    assigned_at = NOW() - INTERVAL '1 hour',
    status = 'in_progress'
WHERE id IN ('33333333-3333-3333-3333-333333333333', '88888888-8888-8888-8888-888888888888');

-- Mark some tickets as resolved
UPDATE support_tickets 
SET status = 'resolved', 
    resolved_at = NOW() - INTERVAL '30 minutes'
WHERE id IN ('66666666-6666-6666-6666-666666666666', 'dddddddd-dddd-dddd-dddd-dddddddddddd');

-- Add some ticket messages for context
INSERT INTO ticket_messages (ticket_id, sender_id, sender_type, message, created_at) VALUES
('33333333-3333-3333-3333-333333333333', '33c74ce6-87fb-4072-8a0a-c2786c9c431f', 'customer', 'This is very frustrating. I need immediate refund.', NOW() - INTERVAL '6 hours'),
('33333333-3333-3333-3333-333333333333', 'eb4d82ae-9bc5-40a1-8c68-61f5b8f9613a', 'agent', 'I understand your concern. I am looking into this payment issue and will get back to you within 2 hours.', NOW() - INTERVAL '5 hours'),
('99999999-9999-9999-9999-999999999999', '0e60fcba-d990-4e04-8e86-b0b8511d1234', 'customer', 'This is unacceptable. I had a medical emergency and your driver failed to show up.', NOW() - INTERVAL '1 hour'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '43e544c8-1696-4c95-963d-b8491f9791a1', 'customer', 'I was late for my meeting because of this. Very poor service.', NOW() - INTERVAL '3 days'),
('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'eb4d82ae-9bc5-40a1-8c68-61f5b8f9613a', 'agent', 'I apologize for the inconvenience. I have noted this feedback and will ensure better driver training.', NOW() - INTERVAL '2 days');

-- Create ticket assignments for audit trail (only for assigned tickets)
INSERT INTO ticket_assignments (ticket_id, agent_id, assigned_by, assignment_type, assigned_at) VALUES
('33333333-3333-3333-3333-333333333333', 'eb4d82ae-9bc5-40a1-8c68-61f5b8f9613a', 'd3d198d2-5eac-4a75-9776-e4b89203acff', 'manual', NOW() - INTERVAL '1 hour'),
('88888888-8888-8888-8888-888888888888', 'eb4d82ae-9bc5-40a1-8c68-61f5b8f9613a', 'd3d198d2-5eac-4a75-9776-e4b89203acff', 'manual', NOW() - INTERVAL '4 days');

-- Summary of created tickets:
-- Pune: 8 tickets (3 high priority, 4 normal priority, 1 low priority)
-- Mumbai: 7 tickets (1 urgent, 3 high priority, 2 normal priority, 1 low priority)
-- Status distribution: 9 open, 2 in_progress, 2 resolved, 2 pending_customer
-- 2 tickets assigned to Mumbai Support agent (respects max 2 active tickets constraint)
-- 5 ticket messages for context
-- 2 ticket assignments for audit trail
