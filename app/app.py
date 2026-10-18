import os
import re

import psycopg
from psycopg.rows import dict_row
from flask import Flask, jsonify, render_template, request
from werkzeug.exceptions import HTTPException

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024


def connect_db():
    return psycopg.connect(
        host=os.environ["DB_HOST"],
        port=os.environ["DB_PORT"],
        dbname=os.environ["DB_NAME"],
        user=os.environ["POSTGRES_USER"],
        password=os.environ["POSTGRES_PASSWORD"],
        connect_timeout=3,
        options="-c statement_timeout=5000",
        row_factory=dict_row,
    )


def validate_student(data):
    if not isinstance(data, dict):
        return None, "Send a JSON object."

    student = {}

    limits = {
        "name": 100,
        "email": 254,
        "student_id": 30,
        "department": 100,
    }

    for field, limit in limits.items():
        value = data.get(field, "")

        if not isinstance(value, str):
            return None, f"{field} must be text."

        value = value.strip()

        if len(value) > limit:
            return None, f"{field} must be at most {limit} characters."

        student[field] = value

    if not student["name"]:
        return None, "Name is required."

    student["email"] = student["email"].lower()

    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", student["email"]):
        return None, "Enter a valid email address."

    # Optional for API clients: the assignment requires name and email.
    # The web form also collects student ID and department.
    student["student_id"] = student["student_id"] or None
    student["department"] = student["department"] or None

    return student, None


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/healthz")
def health():
    # Liveness checks the process, independently of PostgreSQL.
    return jsonify(status="ok"), 200


@app.get("/ready")
def ready():
    try:
        with connect_db() as connection:
            connection.execute("SELECT 1")
        return jsonify(status="ready"), 200
    except psycopg.Error:
        return jsonify(status="not ready"), 503


@app.get("/users")
def list_users():
    with connect_db() as connection:
        rows = connection.execute(
            """
            SELECT id, name, email, student_id, department
            FROM users
            ORDER BY id DESC
            """
        ).fetchall()

    return jsonify(rows)


@app.get("/users/<int:user_id>")
def get_user(user_id):
    with connect_db() as connection:
        row = connection.execute(
            """
            SELECT id, name, email, student_id, department
            FROM users WHERE id = %s
            """,
            (user_id,),
        ).fetchone()

    if row is None:
        return jsonify(error="Student not found."), 404

    return jsonify(row)


@app.post("/users")
def create_user():
    student, error = validate_student(request.get_json(silent=True))

    if error:
        return jsonify(error=error), 400

    with connect_db() as connection:
        row = connection.execute(
            """
            INSERT INTO users (name, email, student_id, department)
            VALUES (%s, %s, %s, %s)
            RETURNING id, name, email, student_id, department
            """,
            (
                student["name"],
                student["email"],
                student["student_id"],
                student["department"],
            ),
        ).fetchone()

    return jsonify(row), 201


@app.put("/users/<int:user_id>")
def update_user(user_id):
    student, error = validate_student(request.get_json(silent=True))

    if error:
        return jsonify(error=error), 400

    with connect_db() as connection:
        row = connection.execute(
            """
            UPDATE users
            SET name = %s, email = %s, student_id = %s, department = %s
            WHERE id = %s
            RETURNING id, name, email, student_id, department
            """,
            (
                student["name"],
                student["email"],
                student["student_id"],
                student["department"],
                user_id,
            ),
        ).fetchone()

    if row is None:
        return jsonify(error="Student not found."), 404

    return jsonify(row)


@app.delete("/users/<int:user_id>")
def delete_user(user_id):
    with connect_db() as connection:
        row = connection.execute(
            "DELETE FROM users WHERE id = %s RETURNING id",
            (user_id,),
        ).fetchone()

    if row is None:
        return jsonify(error="Student not found."), 404

    return "", 204


@app.errorhandler(psycopg.errors.UniqueViolation)
def duplicate_value(error):
    return jsonify(
        error="That email address or student ID is already registered."
    ), 409


@app.errorhandler(psycopg.Error)
def database_error(error):
    app.logger.exception("Database operation failed")
    return jsonify(
        error="Database temporarily unavailable. Please try again."
    ), 503


@app.errorhandler(HTTPException)
def http_error(error):
    return jsonify(error=error.description), error.code