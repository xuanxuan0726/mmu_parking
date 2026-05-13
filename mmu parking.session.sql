-- SETUP INSTRUCTIONS For Dr Ng Kok Why 's MMU Parking System
-- 1. Install PostgreSQl in your computer
-- 1. Create a database named 'mmu_parking' in pgAdmin. ( Right Click Databases -> Create -> Database... )
-- 2. Run the following commands in the Query Tool:

-- 1. Clear out the old tables
DROP TABLE IF EXISTS parking_logs CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 2. Create the upgraded 'users' table
CREATE TABLE users (
    mmu_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    card_uid VARCHAR(50) UNIQUE NOT NULL,
    car_plate VARCHAR(20) UNIQUE NOT NULL
);

-- 3. Create the upgraded 'parking_logs' table (Now with card_uid!)
CREATE TABLE parking_logs (
    id SERIAL PRIMARY KEY,
    card_uid VARCHAR(50) NOT NULL REFERENCES users(card_uid),
    mmu_id VARCHAR(50) NOT NULL REFERENCES users(mmu_id),
    check_in TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    check_out TIMESTAMP
);

-- 4. Create the index to make scanning faster
CREATE INDEX IF NOT EXISTS idx_logs_active ON parking_logs(card_uid) WHERE check_out IS NULL;

-- 5. Insert your dummy student data
INSERT INTO users (mmu_id, name, card_uid, car_plate) VALUES 
('1211101234', 'Ahmad Razak', 'A1B2C3D4', 'VCH 8892'),
('1211105678', 'Siti Nurhaliza', 'E5F6G7H8', 'PPP 7412'),
('1191100112', 'Tan Ah Teck', 'I9J0K1L2', 'BEM 1010'),
('1201103344', 'Priya Mohan', 'M3N4O5P6', 'WXC 5566'),
('1221109988', 'Lee Chong Wei', 'Q7R8S9T0', 'ABC 9999');

-- 6. Insert dummy parking logs (updated to include both mmu_id and card_uid)
INSERT INTO parking_logs (mmu_id, card_uid) VALUES
('1211101234', 'A1B2C3D4'),
('1211105678', 'E5F6G7H8'),
('1191100112', 'I9J0K1L2'),
('1221109988', 'Q7R8S9T0');