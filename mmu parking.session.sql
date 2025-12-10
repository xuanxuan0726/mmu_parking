-- SETUP INSTRUCTIONS For Dr Ng Kok Why 's MMU Parking System
-- 1. Install PostgreSQl in your computer
-- 1. Create a database named 'mmu_parking' in pgAdmin. ( Right Click Databases -> Create -> Database... )
-- 2. Run the following commands in the Query Tool:

DROP TABLE IF EXISTS parking_logs;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    card_uid VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100),
    matrix_id VARCHAR(50),
    car_plate VARCHAR(20)
);

CREATE TABLE parking_logs (
    id SERIAL PRIMARY KEY,
    card_uid VARCHAR(50),
    check_in TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    check_out TIMESTAMP
);

-- Sample Data (So the system isn't empty)
INSERT INTO users (card_uid, name, matrix_id, car_plate)
VALUES ('YOUR_REAL_CARD_ID', 'John Doe', '11223344', 'WWA 1234');