# ProjectCollab AI

A collaborative project management web app built with **React + Vite** (frontend) and **Node + Express** (backend).  The backend uses **Prisma ORM** to interact with a PostgreSQL database.

---

## 📦 Project Structure
```
projectcollab-ai/
├─ .github/workflows/ci.yml        # GitHub Actions CI
├─ backend/                       # Express server
│   ├─ src/                       # Source code
│   ├─ prisma/schema.prisma       # Prisma schema (PostgreSQL now)
│   ├─ .env.example               # Example env file (Supabase placeholder)
│   └─ package.json
├─ frontend/                      # React app
│   ├─ src/                       # Source code
│   └─ package.json
└─ README.md                      # **You are reading it!**
```

---

## 🪄 Supabase PostgreSQL Setup Guide

Supabase provides a managed PostgreSQL instance that works perfectly with Prisma. Follow these steps to create a Supabase project and connect it to the backend.

### 1. Create a Supabase Account & Project
1. Go to https://supabase.com and **sign up** (or log in if you already have an account).
2. Click **"New Project"**.
3. Fill in the required fields:
   - **Project name** – any name you like.
   - **Database password** – remember this; you’ll need it for the connection string.
   - **Region** – choose the region closest to you.
4. Click **"Create new project"**.  Supabase will provision a PostgreSQL database (it takes a few seconds).

### 2. Obtain the PostgreSQL Connection String
1. In the Supabase dashboard, open **Settings → Database**.
2. Under **"Connection string"**, copy the **URL**. It looks like:
```
postgresql://<USER>:<PASSWORD>@<PROJECT_REF>.supabase.co:5432/postgres?schema=public
```
   - `<USER>` is usually `postgres`.
   - `<PASSWORD>` is the password you set when creating the project.
   - `<PROJECT_REF>` is a unique identifier for your project (e.g., `xyz123`).

### 3. Configure `DATABASE_URL` for the Backend
1. In the repository root, go to the backend folder:
```bash
cd backend
```
2. Copy the example env file:
```bash
cp .env.example .env
```
3. Open `.env` in your editor and **replace** the empty string with the connection string you copied:
```
DATABASE_URL="postgresql://postgres:<YOUR_PASSWORD>@<PROJECT_REF>.supabase.co:5432/postgres?schema=public"
```
   - Keep the surrounding double quotes.
   - Ensure there are **no extra spaces**.

### 4. Run Prisma Migrations & Generate Client
```bash
# From the backend directory
npm install               # (if not already installed)
npx prisma migrate dev --name init_pg   # creates tables in Supabase
npx prisma generate        # generates the Prisma client
```
If the migration succeeds you’ll see messages like `Database schema has been push` and `Generated Prisma Client`.  The backend is now connected to Supabase.

---

## 🚀 Development Setup (Local)
### Backend
```bash
cd backend
cp .env.example .env      # (if you haven’t already)
# Edit .env and add your Supabase DATABASE_URL as described above.
npm install
npm run dev                # starts the Express server on PORT (default 5000)
```
### Frontend
```bash
cd ../frontend
npm install
npm run dev                # Vite dev server (default http://localhost:5173)
```
The frontend talks to the backend at `http://localhost:5000` (default).  Adjust the proxy or `REACT_APP_API_URL` if you change ports.

---

## ✅ Verification Checklist
- [ ] `backend/.env` contains a valid Supabase `DATABASE_URL`.
- [ ] `npx prisma migrate dev --name init_pg` runs without errors.
- [ ] `npm run dev` in `backend` starts without Prisma or DB connection errors.
- [ ] All API endpoints (auth, projects, tasks, comments, etc.) respond correctly.  You can test with **Postman**, **curl**, or the frontend UI.
- [ ] No remaining references to `dev.db` or `sqlite` in the codebase.
- [ ] CI workflow now spins up a PostgreSQL container for tests.

---

## 🛠️ CI / GitHub Actions
The workflow (`.github/workflows/ci.yml`) now includes a PostgreSQL service for the backend job, sets `DATABASE_URL` to the container, runs `prisma generate` and `prisma migrate deploy` before building.

---

## 🎉 That's It!
Your ProjectCollab AI app now runs on a fully managed PostgreSQL database via Supabase.  Commit the changes, push to GitHub, and the CI pipeline will verify everything automatically.

If you encounter any issues, double‑check the `DATABASE_URL` format and that the Supabase password is correct.
