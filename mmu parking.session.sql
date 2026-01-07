-- SETUP INSTRUCTIONS For Dr Ng Kok Why 's MMU Parking System
-- 1. Install PostgreSQl in your computer
-- 1. Create a database named 'mmu_parking' in pgAdmin. ( Right Click Databases -> Create -> Database... )
-- 2. Run the following commands in the Query Tool:

DROP TABLE IF EXISTS parking_logs;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    mmu_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100),
    card_uid VARCHAR(50) UNIQUE,
    car_plate VARCHAR(20) UNIQUE
);

CREATE TABLE parking_logs (
    check_out TIMESTAMP,
    check_in TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    mmu_id VARCHAR(50) REFERENCES users
);

INSERT INTO users (mmu_id, name, card_uid, car_plate) VALUES 
('1211101234', 'Ahmad Razak', 'A1B2C3D4', 'VCH 8892'),
('1211105678', 'Siti Nurhaliza', 'E5F6G7H8', 'PPP 7412'),
('1191100112', 'Tan Ah Teck', 'I9J0K1L2', 'BEM 1010'),
('1201103344', 'Priya Mohan', 'M3N4O5P6', 'WXC 5566'),
('1221109988', 'Lee Chong Wei', 'Q7R8S9T0', 'ABC 9999');

INSERT INTO parking_logs (mmu_id) VALUES
('1211101234'),
('1211105678'),
('1191100112')

INSERT INTO parking_logs (mmu_id) VALUES
('1221109988')
