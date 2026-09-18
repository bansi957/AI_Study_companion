# Testing & Quality Assurance Guide

This document outlines the testing strategies, test commands, validation suites, and verification checklists for **AI Study Companion**.

---

## 1. Prerequisites

Before running tests or verifying services:
- **Node.js**: v18+ (tested on Node.js v20/v22)
- **MongoDB**: Active connection to MongoDB Atlas or local MongoDB instance (URI configured in `DB`).
- **Redis**: Active Redis instance or Redis Cloud instance (configured in `REDIS_URL`).
- **Valid API Credentials**: Configured in `.env` for Groq, Cohere, Cloudinary, and Firebase.

---

## 2. Test & Verification Commands

### 2.1 Backend Tests
The backend uses Node.js's built-in test runner (`node --test`) configured in `server/package.json`:

```bash
# In the server directory:
cd server
npm test
```

### 2.2 Frontend Build & Lint Verification
The frontend relies on ESLint and Vite production bundle verification:

```bash
# In the client directory:
cd client

# Check code formatting & linting rules:
npm run lint

# Validate full production build & TypeScript/JSX compilation:
npm run build
```

---

## 3. Core Functional Testing Checklists

### 3.1 Authentication & Authorization Checks
- [ ] **Google OAuth**: Log in via Google Firebase popup; verify Firebase token verification in `auth.controller.js`.
- [ ] **Email & Password**: Register new student account; verify password hashing via `bcryptjs`.
- [ ] **Protected Routes**: Attempt accessing `/app/*` without cookie or auth header; verify 401 redirection to `/login`.
- [ ] **Admin Authorization**: Attempt accessing `/admin` with a standard learner account; verify 403 Forbidden rejection by `admin.middleware.js`.

### 3.2 Project Boundary & Data Isolation Checks
- [ ] **Cross-Project Access**: Query `/api/tutor/chat/:projectId` with a project ID belonging to another user; verify 404 or 403 isolation error.
- [ ] **Vector Isolation**: In `retrieval.service.js`, verify `$vectorSearch` includes `{ filter: { projectId: new ObjectId(projectId) } }` to ensure chunks from other projects or users are never surfaced.
- [ ] **Cascade Deletion**: Delete a Space or Project; verify in MongoDB that all child materials, chunks, quizzes, conversations, and Cloudinary remote assets are purged with zero orphaned records.

### 3.3 Background Processing & Job Queue Checks
- [ ] **BullMQ Queues**: When uploading a PDF, verify jobs transition through `document-extraction` -> `embedding` -> `knowledge-extraction`.
- [ ] **Socket.IO Status**: Observe live UI notifications transitioning from "Extracting text" to "Generating embeddings" to "Ready".
- [ ] **Quota & Backoff Handling**: For LLM and Embedding API 429 errors, verify workers delay and retry without crashing the process.
- [ ] **Graceful Shutdown**: Send `SIGINT` to server process; verify workers gracefully finish in-progress jobs.

### 3.4 AI / RAG & Citation Checks
- [ ] **Grounded Responses**: Ask the AI Tutor a question directly covered by an uploaded document; verify answer contains accurate information.
- [ ] **Citation Verification**: Verify the response contains clickable citations referencing the exact source document name and page number.
- [ ] **Out-of-Scope Queries**: Ask a question not present in the study materials; verify the AI Tutor politely flags that the material does not contain the answer.

### 3.5 Quiz & Mastery Assessment Checks
- [ ] **Quiz Generation**: Trigger quiz generation; verify questions are generated based on the project's extracted concepts.
- [ ] **Adaptive Difficulty**: Verify difficulty adjustments according to student mastery.
- [ ] **Open-Ended Evaluation**: Submit a written response to an open-ended question; verify the LLM rubric evaluation outputs score (0-100%), strengths, and constructive feedback.
- [ ] **Mastery Progression**: Verify concept score updates and records in `MasteryHistory`.

---

## 4. Manual End-to-End User Journey Verification

Follow this end-to-end verification script:
1. Navigate to landing page (`/`) and sign in.
2. Create a new **Space** (e.g., "Computer Systems").
3. Inside the Space, create a new **Project** (e.g., "Operating Systems").
4. In the **Materials** tab, upload a sample academic PDF.
5. Wait for the BullMQ workers to process the document to **Ready** status.
6. Open the **AI Tutor** tab; ask a question based on the document; verify grounded answer and citations.
7. Open the **Quizzes** tab; generate and complete a quiz; review immediate feedback.
8. Inspect the **Mastery** & **Growth** tabs; verify updated concept proficiencies and charts.
9. As an admin, navigate to `/admin` and verify:
   - Overview metrics and system health.
   - Users table and click **Inspect** on any user to view their spaces, projects, quizzes, and activity.
   - Activity event feed and AI Usage multi-model consumption charts.
