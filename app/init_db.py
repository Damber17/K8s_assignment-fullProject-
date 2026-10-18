from app import connect_db

with connect_db() as connection:
    # Both replicas may initialize at the same time.
    # A transaction lock makes table creation run one replica at a time.
    connection.execute("SELECT pg_advisory_xact_lock(2230123)")

    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(254) NOT NULL UNIQUE,
            student_id VARCHAR(30) UNIQUE,
            department VARCHAR(100),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

print("Student database table is ready.", flush=True)