# AI Study Companion

## 1. Overview
AI Study Companion is an AI-powered personalized learning and cognitive growth workspace that transforms academic documents and textbooks into grounded interactive study environments. Built with a decoupled micro-worker architecture, the platform automatically ingests, extracts, and semantically indexes study materials into high-dimensional vector spaces using Cohere and MongoDB Atlas Vector Search. Learners engage with an AI Tutor grounded strictly in their uploaded materials with verified source citations, test their retention through dynamically generated adaptive quizzes and open-ended rubric assessments, and track their cognitive mastery and retention curves over time.

---

## 2. Core Learning Loop

```
Create Space
→ Create Project
→ Add Material
→ Process Material
→ AI Tutor
→ Adaptive Quiz
→ Assessment
→ Mastery
→ Growth
→ Recommendation
→ Continue Learning
```

---

## 3. Key Features

- **Hierarchical Study Organization**: Multi-level organization structured into academic Spaces (e.g., Computer Science) containing specialized Projects (e.g., Operating Systems).
- **Asynchronous Document Pipeline**: High-throughput PDF extraction with Tesseract OCR fallback, automated text chunking, and real-time Socket.IO ingestion feedback.
- **Grounded AI Tutor (RAG)**: Interactive conversational tutor powered by Groq LLMs and Cohere Embed v4.0, enforcing strict context grounding with verified document names and page numbers.
- **Adaptive Quiz Generation**: On-demand assessment engine supporting Multiple Choice Questions (MCQs) with plausible distractors and open-ended conceptual questions.
- **Automated Open-Ended Rubric Evaluation**: Instant qualitative grading of written student answers evaluating accuracy, conceptual depth, key concepts covered, and constructive feedback.
- **Live Concept Knowledge Graphs**: Dynamic extraction and visualization of domain concepts, dependencies, and prerequisite relationships.
- **Dynamic Mastery & Spaced Decay**: Continuous tracking of concept proficiency across 5 mastery tiers with confidence scores and simulated memory retention decay.
- **Intelligent Recommendations**: Automated guidance surfacing weak concepts and high-priority revision topics.
- **Admin Intelligence Dashboard**: Platform-level visibility including multi-model daily LLM consumption line graphs, event feeds, user inspection modals, and live system health monitoring.
- **Complete Cascading Purging**: Clean resource deletion ensuring deleting a space or project completely wipes conversations, quizzes, vector chunks, and Cloudinary cloud assets.

---

## 4. Technology Stack

### Frontend
- **Framework**: React 19 (Vite)
- **State Management**: Redux Toolkit & RTK Query
- **Routing**: React Router v7
- **Styling**: Tailwind CSS
- **Real-Time Client**: Socket.IO Client
- **Math & Markdown**: KaTeX, `rehype-katex`, `remark-math`, `react-markdown`
- **Icons**: Lucide React

### Backend
- **Runtime**: Node.js (v18+)
- **Framework**: Express 5
- **Real-Time Engine**: Socket.IO
- **Object Data Modeling**: Mongoose 8/9
- **Authentication**: Firebase Admin SDK & JSON Web Tokens (JWT)

### Database
- **Primary Data Store**: MongoDB Atlas

### Vector Search
- **Vector Search Engine**: MongoDB Atlas Vector Search (1024-dimensional cosine similarity indexing)

### Background Processing
- **Queue Broker**: Redis (Redis Cloud / IORedis)
- **Job Orchestrator**: BullMQ (Decoupled workers: `document-extraction`, `embedding`, `knowledge-extraction`)

### Storage
- **Asset Storage**: Cloudinary (Secure PDF binary storage and remote asset management)

### Authentication
- **Identity Provider**: Firebase Google Authentication & Email/Password with JWT cookies

### AI
- **LLM Inference**: Groq Cloud SDK (`openai/gpt-oss-120b`, `openai/gpt-oss-20b`)
- **Vector Embeddings**: Cohere Embed API (`embed-v4.0`, 1024 dimensions)

---

## 5. Repository Structure

```
AI_Study_Companion/
├── client/                               # Frontend Single-Page Application
│   ├── public/                           # Static assets, logos, and favicons
│   ├── src/
│   │   ├── app/                          # Redux store configuration
│   │   ├── components/                   # UI library, layout components, and modals
│   │   ├── features/                     # RTK Query API slice definitions
│   │   ├── pages/                        # Landing, Auth, Spaces, Projects, Admin
│   │   ├── services/                     # Axios client, Firebase auth, Socket.io
│   │   ├── utils/                        # Math & formatting utilities
│   │   ├── App.jsx                       # Root routing & layout
│   │   └── main.jsx                      # Entrypoint
│   ├── .env.example                      # Client environment template
│   ├── package.json
│   └── vite.config.js
│
├── server/                               # Backend REST API & Workers
│   ├── config/                           # DB, Redis, Cloudinary, Firebase, Socket.io
│   ├── controllers/                      # Route request handlers
│   ├── middleware/                       # Auth, Admin role verification, Uploads
│   ├── models/                           # Mongoose schemas (15 models)
│   ├── queues/                           # BullMQ queue initializers
│   ├── routes/                           # Express route declarations
│   ├── services/
│   │   ├── ai/                           # Groq LLM, Tutor, Quiz, Recommendations
│   │   ├── analytics/                    # Admin analytics, Activity logging
│   │   ├── documents/                    # PDF parsing, OCR, Chunking, Knowledge
│   │   ├── learning/                     # Mastery calculation, Growth history
│   │   └── retrieval/                    # Cohere embedding service & Atlas search
│   ├── utils/                            # Cascade deletion, JWT, API response helpers
│   ├── workers/                          # BullMQ worker processors & runner
│   ├── server.js                         # Main Express application entrypoint
│   ├── .env.example                      # Server environment template
│   └── package.json
│
├── docs/                                 # Technical & Architectural Documentation
│   ├── architecture.md                   # Detailed system & pipeline architecture
│   ├── ai-usage.md                       # AI models, RAG specs, and token tracking
│   ├── development-prompts.md            # System prompts & grounding templates
│   ├── testing.md                        # Testing checklists & verification suite
│   └── deployment.md                     # Production infrastructure & Render setup
│
├── .env.example                          # Monorepo unified environment template
├── .gitignore                            # Comprehensive git exclusion rules
└── README.md                             # Project overview & evaluator guide
```

---

## 6. Prerequisites

To run this repository locally, you will need:
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher
- **MongoDB Atlas**: Cluster with an active Vector Search index (`vector_index`)
- **Redis**: Local Redis server (`localhost:6379`) or a hosted Redis Cloud instance
- **Cloudinary Account**: Cloud name, API key, and API secret
- **Groq API Key**: For fast LLM inference
- **Cohere API Key**: For 1024-dimensional vector embeddings
- **Firebase Project**: Web credentials for client and service account keys for server

---

## 7. Setup Instructions

### 1. Clone the repository
```bash
git clone https://github.com/bansi957/AI_Study_companion.git
cd AI_Study_companion
```

### 2. Install Server Dependencies
```bash
cd server
npm install
cd ..
```

### 3. Install Client Dependencies
```bash
cd client
npm install
cd ..
```

---

## 8. Configuration

Copy the provided example environment templates to `.env` in both the server and client directories:

```bash
# Server configuration
cp server/.env.example server/.env

# Client configuration
cp client/.env.example client/.env
```

Open each `.env` file in your editor and populate your respective API keys and database connection strings.

---

## 9. Environment Variables

The project uses modular environment configuration templates. Variable purposes:

### Backend (`server/.env` / `.env.example`)
- `PORT`: HTTP port for Express server (default: `3000`).
- `DB`: MongoDB Atlas connection URI with read/write permissions.
- `REDIS_URL`: Redis URI used by BullMQ for background queues.
- `JWT_SECRET`: Random cryptographic string used for signing user session tokens.
- `GROQ_API_KEY`: API key for Groq accelerated LLM inference.
- `COHERE_API_KEY`: API key for Cohere Embed v4.0 vector embeddings.
- `EMBEDDING_PROVIDER`: Selected embedding engine (`cohere`).
- `EMBEDDING_MODEL`: Specific model identifier (`embed-v4.0`).
- `EMBEDDING_DIMENSION`: Dimension vector output (`1024`).
- `CLOUDINARY_*`: Credentials for storing PDF files remotely.
- `FIREBASE_*`: Service account keys used to verify Google OAuth ID tokens.
- `RUN_WORKER`: Set to `true` to run BullMQ workers in-process with the web server.

### Frontend (`client/.env` / `client/.env.example`)
- `VITE_API_URL`: Backend endpoint base URL (`http://localhost:3000/api`).
- `VITE_SOCKET_URL`: Backend host for Socket.IO (`http://localhost:3000`).
- `VITE_FIREBASE_*`: Firebase Web SDK configuration keys for client authentication.

---

## 10. Running Locally

### Option A: Standard Development Mode (Workers In-Process)

1. **Start the Backend API & Background Workers**:
   ```bash
   cd server
   npm start
   ```
   *(By default, `RUN_WORKER=true`, starting `document-extraction`, `embedding`, and `knowledge-extraction` workers automatically inside the server process).*

2. **Start the Frontend Development Server**:
   ```bash
   cd client
   npm run dev
   ```
   *The application will be accessible at `http://localhost:5173`.*

### Option B: Decoupled Worker Process Mode

If you wish to run the background worker process separately from the API server:
1. In `server/.env`, set `RUN_WORKER=false`.
2. Start the API server:
   ```bash
   cd server
   npm start
   ```
3. In a separate terminal, start the dedicated worker runner:
   ```bash
   cd server
   npm run worker
   ```

---

## 11. Document Processing

The document ingestion pipeline processes documents asynchronously through three BullMQ queues:

```
PDF
→ Cloudinary
→ Material
→ Redis/BullMQ
→ Document Extraction
→ Semantic Chunks
→ Cohere Embeddings
→ MongoDB Atlas Vector Search
→ Concept Extraction
→ Ready
```

1. **PDF Upload**: Document binary is validated and uploaded to Cloudinary.
2. **Material Record**: A `Material` record is created in MongoDB with status `QUEUED`.
3. **Queue Ingestion**: The extraction job is dispatched to Redis via BullMQ.
4. **Document Extraction**: Text is parsed via `pdf-parse` (with automatic Tesseract OCR fallback for scanned pages).
5. **Semantic Chunks**: Raw text is partitioned into semantically coherent overlapping chunks (1000 characters, 150 overlap).
6. **Cohere Embeddings**: Chunks are processed in batches of 32 using Cohere `embed-v4.0` (`input_type="search_document"`) into 1024-dimensional vectors.
7. **Vector Indexing**: Chunks are written to MongoDB Atlas, where the `vector_index` indexes them immediately.
8. **Concept Extraction**: Fast LLMs analyze the chunks to extract domain concepts and definitions.
9. **Ready State**: Material status transitions to `READY`, notifying the student via Socket.IO.

---

## 12. AI / RAG

The AI Tutor employs a strict Retrieval-Augmented Generation (RAG) architecture:

```
Question
→ Cohere query embedding
→ MongoDB Atlas Vector Search
→ relevant project chunks
→ grounded prompt
→ Groq
→ answer + verified citations
```

1. **Query Vectorization**: Student question is embedded via Cohere `embed-v4.0` using `input_type="search_query"`.
2. **Isolated Vector Search**: MongoDB Atlas `$vectorSearch` performs cosine similarity matching strictly filtered by the current `projectId`.
3. **Context Assembly**: Top matching chunks exceeding the relevance threshold are extracted with document titles and page numbers.
4. **Grounded Prompt Construction**: An anti-hallucination prompt binds the LLM to only assert claims verifiable from the retrieved context.
5. **Inference & Citation Delivery**: Groq generates the pedagogical response accompanied by verified source page citations.

---

## 13. Testing

### Available Test Commands
- **Backend Test Suite**:
  ```bash
  cd server
  npm test
  ```
  Runs Node.js native test runner (`node --test`).
- **Frontend Code Quality & Compilation**:
  ```bash
  cd client
  npm run lint    # ESLint rule enforcement
  npm run build   # Production JSX & bundle validation
  ```

### Functional Validation Areas
- **Authentication**: Google OAuth token verification and JWT session validation.
- **Boundary Isolation**: Ensuring users and projects cannot access or retrieve vectors belonging to others.
- **RAG Accuracy**: Validating that questions generate responses with accurate citations.
- **Quiz Evaluations**: Confirming open-ended answers receive detailed 0-100 rubric evaluations.
- **Cascading Deletes**: Verifying that deleting spaces or projects purges all associated chats, quizzes, and cloud assets.

See [docs/testing.md](docs/testing.md) for full quality assurance checklists.

---

## 14. Deployment

The system is deployed on production cloud infrastructure:
- **Backend Service**: Render Web Service running Node.js (`--expose-gc --max-old-space-size=384 server.js`).
- **Frontend SPA**: Static build deployed on cloud CDN.
- **Database & Search**: MongoDB Atlas Cluster with an active Vector Search index (`vector_index`).
- **Cache & Queues**: Redis Cloud instance managing BullMQ queues.
- **Media Asset Storage**: Cloudinary managing document files.
- **Authentication**: Firebase Authentication.
- **Inference Providers**: Groq Cloud and Cohere API.

See [docs/deployment.md](docs/deployment.md) for step-by-step production deployment instructions.

---

## 15. Security

- **Authentication**: Robust token verification supporting Firebase ID tokens and HTTP-only signed JWT cookies.
- **Role-Based Authorization**: Administrative APIs (`/api/admin/*`) are guarded by `admin.middleware.js` to ensure access is restricted to verified administrators.
- **Project Boundary Isolation**: Multi-tenant data segregation enforced across all database queries and vector searches via `projectId` constraints.
- **Environment Secrets**: Zero hardcoded secrets; credentials are fully managed via secure environment variables.
- **Cascading Purge & Data Privacy**: Complete removal of student data, chat history, quiz attempts, and remote Cloudinary files upon workspace deletion.
- **API Protection**: Request body sanitization, file-type whitelisting, and quota rate limiting to guard against API exhaustion.

---

## 16. Documentation

Comprehensive technical documentation is maintained in the `docs/` directory:

| Document | Description |
| :--- | :--- |
| **[docs/architecture.md](docs/architecture.md)** | Detailed system components, data schemas, and pipeline architectures |
| **[docs/ai-usage.md](docs/ai-usage.md)** | Multi-model strategy, Cohere vector configurations, and RAG evaluation |
| **[docs/development-prompts.md](docs/development-prompts.md)** | Full library of system prompts, grounding rules, and evaluation rubrics |
| **[docs/testing.md](docs/testing.md)** | Quality assurance guides, testing checklists, and verification commands |
| **[docs/deployment.md](docs/deployment.md)** | Production hosting setup, Render configuration, and Atlas index guides |

---

## 17. Known Limitations

- **Free-Tier Cold Starts**: Hosted instances on free-tier compute may experience a brief initial cold-start delay on first request.
- **Scanned Document OCR Latency**: Highly complex or low-resolution image PDFs rely on Tesseract OCR, which takes longer to process than native digital text PDFs.
- **Embedding Rate Limits**: Large multi-hundred-page textbooks uploaded in bulk may occasionally experience rate limiting from embedding providers; the built-in BullMQ backoff automatically pauses and retries.

---

## 18. Demo Flow

1. **Authentication**: Sign in using Google OAuth or register an email/password account.
2. **Create Space**: Initialize a subject workspace (e.g., "Computer Science").
3. **Create Project**: Add a module workspace (e.g., "Operating Systems").
4. **Upload Material**: Upload a lecture PDF in the Materials tab; observe real-time BullMQ parsing and concept extraction via Socket.IO.
5. **AI Tutor Query**: Ask conceptual questions in the AI Tutor tab; inspect grounded answers and verified page citations.
6. **Adaptive Quiz**: Navigate to the Quizzes tab, generate an assessment, answer multiple choice and open-ended questions, and review immediate rubric evaluations.
7. **Cognitive Mastery**: View the Mastery & Growth tabs to review concept scores, confidence levels, and personalized study recommendations.
8. **Admin Dashboard**: Switch to `/admin` to monitor multi-model daily LLM request volumes, tokens, activity logs, and inspect individual learner workspaces.

---

## 19. Public Repository

This repository contains the complete source code and technical documentation for AI Study Companion and is intended to be publicly accessible for automated evaluation and technical review.

Clone:
```bash
git clone https://github.com/bansi957/AI_Study_companion.git
```
