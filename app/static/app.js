const form = document.querySelector("#student-form");
const list = document.querySelector("#student-list");
const search = document.querySelector("#search");
const message = document.querySelector("#message");
const saveButton = document.querySelector("#save-button");
const cancelButton = document.querySelector("#cancel-button");
const refreshButton = document.querySelector("#refresh-button");

let students = [];
let editingId = null;
let busy = false;
let loaded = false;

function notify(text, error = false) {
  message.textContent = text;
  message.className = error ? "message error" : "message";
  message.hidden = false;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  if (response.status === 204) return null;

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status}).`);
  }

  return data;
}

function resetForm() {
  form.reset();
  editingId = null;
  document.querySelector("#form-title").textContent = "Add a student";
  saveButton.textContent = "Save student";
  cancelButton.textContent = "Clear";
}

function setBusy(value) {
  busy = value;
  form.querySelectorAll("input, select, button").forEach(element => {
    element.disabled = value;
  });
  refreshButton.disabled = value;
  renderStudents();
}

function cell(value) {
  const element = document.createElement("td");
  element.textContent = value || "—";
  return element;
}

function renderStudents() {
  const query = search.value.trim().toLowerCase();

  const filtered = students.filter(student =>
    [student.name, student.email, student.student_id, student.department]
      .some(value => String(value || "").toLowerCase().includes(query))
  );

  list.replaceChildren();

  for (const student of filtered) {
    const row = document.createElement("tr");

    row.append(
      cell(student.name),
      cell(student.student_id),
      cell(student.email),
      cell(student.department)
    );

    const actionsCell = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "actions";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "secondary";
    edit.textContent = "Edit";
    edit.disabled = busy;
    edit.setAttribute("aria-label", `Edit ${student.name}`);
    edit.addEventListener("click", () => editStudent(student));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = "Delete";
    remove.disabled = busy;
    remove.setAttribute("aria-label", `Delete ${student.name}`);
    remove.addEventListener("click", () => deleteStudent(student));

    actions.append(edit, remove);
    actionsCell.append(actions);
    row.append(actionsCell);
    list.append(row);
  }

  document.querySelector("#count").textContent = loaded
    ? `${students.length} registered · ${filtered.length} shown`
    : "Students have not loaded yet.";

  document.querySelector("#empty-state").hidden =
    !loaded || filtered.length > 0;
}

async function loadStudents() {
  students = await api("/users");
  loaded = true;
  renderStudents();
}

function editStudent(student) {
  editingId = student.id;

  for (const key of ["name", "email", "student_id", "department"]) {
    const field = form.elements.namedItem(key);
    const value = student[key] || "";

    if (key === "department" && value &&
        !Array.from(field.options).some(option => option.value === value)) {
      field.add(new Option(value, value));
    }

    field.value = value;
  }

  document.querySelector("#form-title").textContent = "Edit student";
  saveButton.textContent = "Update student";
  cancelButton.textContent = "Cancel edit";
  form.scrollIntoView({ behavior: "smooth", block: "center" });
  form.elements.namedItem("name").focus();
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy || !form.reportValidity()) return;

  const data = Object.fromEntries(new FormData(form).entries());

  for (const key of Object.keys(data)) {
    data[key] = data[key].trim();
  }

  if (Object.values(data).some(value => !value)) {
    notify("Please complete every field.", true);
    return;
  }

  const updating = editingId !== null;
  const path = updating ? `/users/${editingId}` : "/users";

  setBusy(true);

  try {
    await api(path, {
      method: updating ? "PUT" : "POST",
      body: JSON.stringify(data)
    });

    resetForm();
    notify(updating ? "Student updated." : "Student added.");

    try {
      await loadStudents();
    } catch (error) {
      notify(`Saved, but the list could not refresh: ${error.message}`, true);
    }
  } catch (error) {
    notify(error.message, true);
  } finally {
    setBusy(false);
  }
});

async function deleteStudent(student) {
  if (busy || !confirm(`Delete ${student.name}? This cannot be undone.`)) return;

  setBusy(true);

  try {
    await api(`/users/${student.id}`, { method: "DELETE" });

    if (editingId === student.id) resetForm();
    students = students.filter(item => item.id !== student.id);
    notify("Student deleted.");
  } catch (error) {
    notify(error.message, true);
  } finally {
    setBusy(false);
  }
}

cancelButton.addEventListener("click", resetForm);
search.addEventListener("input", renderStudents);

refreshButton.addEventListener("click", async () => {
  setBusy(true);
  try {
    await loadStudents();
    notify("Student list refreshed.");
  } catch (error) {
    notify(error.message, true);
  } finally {
    setBusy(false);
  }
});

loadStudents().catch(error => notify(error.message, true));