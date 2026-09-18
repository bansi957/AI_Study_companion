# AI Study Companion — System Architecture

This document provides a comprehensive technical overview of the architecture, components, data flows, and infrastructure of the **AI Study Companion** platform.

---

## 1. High-Level Architecture Overview

AI Study Companion is built on a decoupled, asynchronous, and scalable client-server architecture designed for high-performance retrieval-augmented generation (RAG), real-time student interaction, and adaptive learning evaluation.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Client Application                            │
│           React 19 + Redux Toolkit + RTK Query + Tailwind CSS           │
│           Socket.IO Client + KaTeX Markdown Math Rendering              │
└──────────────────┬──────────────────────────────────────▲───────────────┘
                   │ HTTPS / REST API                     │ WebSockets
                   │ (Axios / JWT)                        │ (Realtime Progress)
┌──────────────────▼──────────────────────────────────────┴───────────────┐
│                         Express API Server                              │
│         Node.js + Express 5 + Socket.IO + Mongoose ODM                  │
│   Authentication Middleware (Firebase Admin + JWT) + Rate Limiters      │
└────────┬──────────────────────────┬─────────────────────────────┬───────┘
         │                          │                             │
┌────────▼──────────┐      ┌────────▼──────────┐         ┌────────▼──────┐
│   MongoDB Atlas   │      │    Redis Cloud    │         │  Cloudinary   │
│  - Document Store │      │  - BullMQ Queues  │         │  - Secure PDF │
│  - Vector Search  │      │  - Event Pub/Sub  │         │    Storage    │
│    (1024-dim)     │      │  - Rate Limiting  │         │  - Raw Assets │
└────────▲──────────┘      └────────┬──────────┘         └───────────────┘
         │                          │
         │                          │ Job Queue
         │                 ┌────────▼──────────┐
         │                 │  BullMQ Workers   │
         │                 │ - doc-extraction  │
         │                 │ - embedding       │
         │                 │ - knowledge       │
         │                 └────────┬──────────┘
         │                          │
┌────────┴──────────────────────────▼─────────────────────────────────────┐
│                           External AI Services                          │
│  - Cohere API: embed-v4.0 (1024 dimensions, document/query vectors)     │
│  - Groq Inference: openai/gpt-oss-120b & openai/gpt-oss-20b             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Components

### 2.1 Frontend (Client)
- **Framework**: React 19 (Vite)
- **State Management**: Redux Toolkit & RTK Query for normalized API caching and optimistic state management.
- **Routing**: React Router v7 with protected routes (`ProtectedRoute`, `LearnerOnlyRoute`, `AdminRoute`).
- **Styling**: Tailwind CSS with custom glassmorphic dark-mode design system.
- **Mathematical Rendering**: KaTeX + `rehype-katex` + `remark-math` + `react-markdown` for LaTeX equations and rich formatting.
- **Realtime**: Socket.IO Client listening for asynchronous document extraction, embedding progress, and status transitions.

### 2.2 Backend (Server)
- **Runtime**: Node.js with Express 5.
- **Process Memory Profile**: Tuned for production stability (`--expose-gc --max-old-space-size=384`).
- **Authentication**: Hybrid authentication supporting Firebase Google OAuth verification and secure JWT cookies.
- **Database Abstraction**: Mongoose with strict schema validation, indexes, and cascading deletion hooks.
- **Background Worker Engine**: BullMQ backed by Redis for multi-stage asynchronous document pipelines.

### 2.3 Data Store & Search
- **Primary Database**: MongoDB Atlas.
- **Vector Search Engine**: MongoDB Atlas Vector Search utilizing hierarchical navigable small world (HNSW) indexing with 1024 dimensions and cosine similarity.
- **Cache & Message Broker**: Redis 6+ / Redis Cloud.

### 2.4 External AI APIs
- **Embeddings**: Cohere Embed API (`embed-v4.0`, 1024 dimensions, float vectors).
  - Document chunks: `input_type="search_document"`.
  - Tutor / retrieval queries: `input_type="search_query"`.
- **Large Language Models**: Groq Cloud SDK.
  - Primary reasoning & tutoring: `openai/gpt-oss-120b`.
  - Fast generation & classification: `openai/gpt-oss-20b`.

---

## 3. Database Schema & Data Models

| Model | Collection | Primary Responsibility |
| :--- | :--- | :--- |
| **`User`** | `users` | User credentials, roles (`user`, `admin`), profile data, preferences. |
| **`Space`** | `spaces` | Top-level academic or personal subject workspaces (e.g., Computer Science). |
| **`Project`** | `projects` | Granular study modules inside a Space (e.g., Algorithms & Data Structures). |
| **`Material`** | `materials` | Uploaded study materials (PDF metadata, Cloudinary URL, processing status). |
| **`ExtractedContent`** | `extractedcontents` | Extracted page-level text, OCR results, and raw textual representations. |
| **`Chunk`** | `chunks` | Semantic text chunks with 1024-dimensional Cohere vector embeddings and page references. |
| **`Concept`** | `concepts` | Extracted knowledge graph nodes (concept name, description, prerequisites, difficulty). |
| **`Conversation`** | `conversations` | AI Tutor sessions containing embedded chronological messages, questions, and verified source citations. |
| **`Quiz`** | `quizzes` | Dynamically generated adaptive assessments with MCQ and open-ended rubrics. |
| **`QuizAttempt`** | `quizattempts` | Student submissions, answers, scores, and LLM open-ended evaluations. |
| **`Mastery`** | `masteries` | Per-concept mastery levels (Level 1 to 5), confidence scores, and retention decay. |
| **`MasteryHistory`** | `masteryhistories` | Historical snapshots of concept mastery for learning curve visualization. |
| **`Recommendation`** | `recommendations` | Proactive review suggestions generated from weak concepts and study streaks. |
| **`Activity`** | `activities` | Audit trail of student milestones and administrative event feeds. |
| **`AIUsage`** | `aiusages` | Audit log of token consumption, latency, cost estimation, and model performance. |

---

## 4. End-to-End Processing Pipelines

### 4.1 Asynchronous Document Ingestion Pipeline
Document processing is executed through three decoupled BullMQ queues to ensure zero request timeout and low memory overhead:

```
User uploads PDF
       │
       ▼
[Express / Multer] ──► Uploads raw binary to Cloudinary
       │
       ▼
Create Material Record (Status: QUEUED)
       │
       ▼
Enqueues to "document-extraction" queue
       │
       ▼
[Extraction Worker] ──► Streams from Cloudinary / local fallback
                    ──► Parses text using pdf-parse
                    ──► Fallback to Tesseract OCR for scanned pages
                    ──► Stores ExtractedContent record
                    ──► Emits Socket.IO update ("Extracting text")
                    ──► Enqueues to "embedding" queue
       │
       ▼
[Embedding Worker]  ──► Splits text into semantic chunks (1000 chars, 150 overlap)
                    ──► Batches chunks (batch size: 32)
                    ──► Generates 1024-dim vectors via Cohere embed-v4.0
                    ──► Stores Chunk documents in MongoDB
                    ──► Emits Socket.IO update ("Generating embeddings")
                    ──► Enqueues to "knowledge-extraction" queue
       │
       ▼
[Knowledge Worker]  ──► Analyzes chunks with Groq LLM
                    ──► Extracts key concepts, definitions & prerequisites
                    ──► Stores Concept documents
                    ──► Updates Material status to READY
                    ──► Emits Socket.IO update ("Ready")
```

### 4.2 Retrieval-Augmented Generation (RAG) AI Tutor Pipeline
When a student asks a question in the AI Tutor workspace tab:

1. **Input Normalization**: Query is sanitized and validated.
2. **Query Vectorization**: Cohere `embed-v4.0` generates a 1024-dimensional embedding with `input_type="search_query"`.
3. **Atlas Vector Search**: Executes `$vectorSearch` pipeline strictly scoped to `projectId`:
   ```javascript
   {
     $vectorSearch: {
       index: "vector_index",
       path: "vector",
       queryVector: queryEmbedding,
       numCandidates: 50,
       limit: 5,
       filter: { projectId: new ObjectId(projectId) }
     }
   }
   ```
4. **Context Grounding**: Relevant chunks above similarity threshold are extracted with document name and page numbers.
5. **Prompt Synthesis**: Strict grounding instructions ensure answers are formulated solely from the verified study context.
6. **Inference**: Groq LLM generates the response with precise source citations.
7. **Persistence & Activity**: Saved to `Conversation` subdocument array and recorded in `Activity` and `AIUsage` collections.

---

## 5. Security and Data Isolation

- **Project Scoping**: All vector queries, chunks, concepts, quizzes, and conversations enforce project boundary isolation via `projectId` and `userId` filters.
- **Cascading Deletion**: Deleting a project or space triggers complete cascading purging of all child resources (conversations, quizzes, chunks, materials, and Cloudinary remote assets) to eliminate orphaned data.
- **Role-Based Access Control**: Platform administration routes (`/api/admin/*`) are protected by `admin.middleware.js`, verifying authenticated user role is strictly `"admin"`.
- **Credential Protection**: No secrets or connection strings are checked into version control. Environment variables are loaded through strict server-side configuration loaders.
