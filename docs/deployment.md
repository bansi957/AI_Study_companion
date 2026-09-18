# Production Deployment Guide

This document covers the production architecture, cloud service configurations, environment variables, build processes, and deployment verification for **AI Study Companion**.

---

## 1. Production Architecture Overview

The deployed infrastructure consists of:
- **Backend API & Workers**: Hosted on **Render** as a Node.js web service running Express 5, Socket.IO, and BullMQ worker queues.
- **Frontend SPA**: Static web application built with Vite and deployed on cloud hosting (Render / Vercel).
- **Primary Database & Search**: **MongoDB Atlas** with an Atlas Vector Search index.
- **Queue Broker & Cache**: **Redis Cloud** managing BullMQ asynchronous jobs.
- **Media & File Storage**: **Cloudinary** managing secure PDF document uploads.
- **Authentication**: **Firebase Authentication** (Google OAuth & identity tokens).
- **AI Infrastructure**:
  - **Cohere Embeddings API**: `embed-v4.0` generating 1024-dimensional float embeddings.
  - **Groq Cloud**: Accelerated LLM inference for tutoring and evaluations (`openai/gpt-oss-120b`, `openai/gpt-oss-20b`).

---

## 2. Cloud Service Setup

### 2.1 MongoDB Atlas & Vector Search Index
1. Deploy an M0 or higher cluster on MongoDB Atlas.
2. In the Atlas web interface, navigate to **Atlas Search & Vector Search**.
3. Create a Vector Search index on the database's `chunks` collection:
   - **Index Name**: `vector_index`
   - **JSON Configuration**:
   ```json
   {
     "fields": [
       {
         "type": "vector",
         "path": "vector",
         "numDimensions": 1024,
         "similarity": "cosine"
       },
       {
         "type": "filter",
         "path": "projectId"
       }
     ]
   }
   ```

### 2.2 Redis Cloud
1. Provision a Redis Cloud database instance.
2. Note the connection URI (e.g. `rediss://default:<password>@<host>:<port>`).
3. Set this URI as `REDIS_URL`.

### 2.3 Cloudinary
1. Create a Cloudinary account.
2. Note `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`.

### 2.4 Firebase Authentication & Admin SDK
1. In the Firebase Console, create a project and enable Google Sign-In under **Authentication > Sign-in method**.
2. Under **Project Settings > General > Your apps**, register a Web app and extract the `VITE_FIREBASE_*` configuration for the client.
3. Under **Project Settings > Service Accounts**, generate a new private key and set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` for the backend.

### 2.5 AI Providers
- **Groq**: Generate API key at [console.groq.com](https://console.groq.com) and assign to `GROQ_API_KEY`.
- **Cohere**: Generate API key at [dashboard.cohere.com](https://dashboard.cohere.com) and assign to `COHERE_API_KEY`.

---

## 3. Render Backend Deployment

### 3.1 Service Configuration
- **Environment**: Node.js
- **Root Directory**: `server`
- **Build Command**: `npm install`
- **Start Command**: `node --expose-gc --max-old-space-size=384 server.js`
- **Health Check Path**: `/health`

> **Memory Optimization Note**: Setting `--expose-gc --max-old-space-size=384` ensures optimal garbage collection on memory-constrained containers (e.g., Render Free/Starter tiers with 512 MB RAM).

### 3.2 Production Environment Variables (Render)

| Variable | Description | Example / Format |
| :--- | :--- | :--- |
| `NODE_ENV` | Runtime environment | `production` |
| `PORT` | Web server port | `3000` (or assigned by Render) |
| `DB` | MongoDB Atlas Connection String | `mongodb+srv://...` |
| `REDIS_URL` | Redis instance connection URI | `rediss://...` |
| `JWT_SECRET` | Secret key for signed session tokens | Random 64-character string |
| `CLIENT_URL` | Allowed frontend origin for CORS | `https://your-frontend.onrender.com` |
| `GROQ_API_KEY` | Groq Cloud API Key | `gsk_...` |
| `LLM_MODEL` | Primary reasoning model | `openai/gpt-oss-120b` |
| `LLM_PRIMARY_MODEL`| Primary LLM | `openai/gpt-oss-120b` |
| `LLM_FAST_MODEL` | Fast generation model | `openai/gpt-oss-20b` |
| `CONCEPT_LLM_MODEL`| Concept extraction model | `openai/gpt-oss-120b` |
| `COHERE_API_KEY` | Cohere API Key | `...` |
| `EMBEDDING_PROVIDER`| Embedding provider | `cohere` |
| `EMBEDDING_MODEL` | Cohere embedding model | `embed-v4.0` |
| `EMBEDDING_DIMENSION`| Output vector dimension | `1024` |
| `EMBEDDING_BATCH_SIZE`| Batch size for chunk embeddings | `32` |
| `CHUNK_TARGET_SIZE`| Target chunk size in characters | `1000` |
| `CHUNK_OVERLAP` | Overlap in characters | `150` |
| `CHUNK_MAX_SIZE` | Maximum chunk size | `1500` |
| `CLOUDINARY_CLOUD_NAME`| Cloudinary cloud identifier | String |
| `CLOUDINARY_API_KEY` | Cloudinary API Key | String |
| `CLOUDINARY_API_SECRET`| Cloudinary API Secret | String |
| `FIREBASE_PROJECT_ID` | Firebase Project ID | String |
| `FIREBASE_CLIENT_EMAIL`| Firebase Service Account Email | `...@...iam.gserviceaccount.com` |
| `FIREBASE_PRIVATE_KEY` | Firebase Service Account Private Key | `"-----BEGIN PRIVATE KEY-----\n..."` |
| `RUN_WORKER` | Integrated BullMQ worker execution | `true` |

---

## 4. Client Frontend Deployment

### 4.1 Service Configuration
- **Root Directory**: `client`
- **Build Command**: `npm install && npm run build`
- **Publish Directory**: `dist`

### 4.2 Production Environment Variables (Client)

| Variable | Description |
| :--- | :--- |
| `VITE_API_URL` | Full URL to deployed backend API (e.g. `https://your-api.onrender.com/api`) |
| `VITE_SOCKET_URL` | (Optional) URL for Socket.IO (defaults to backend host) |
| `VITE_FIREBASE_API_KEY` | Firebase Web API Key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage Bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Messaging Sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase Web App ID |

---

## 5. Deployment Verification Checklist

1. **Health Check**: Send `GET /health` to backend; verify response:
   ```json
   { "success": true, "message": "Server is running" }
   ```
2. **Database Connectivity**: Verify server logs show `Successfully connected to MongoDB`.
3. **Atlas Vector Search**: Confirm `retrievalService.ensureVectorIndex()` successfully detected or initialized `vector_index`.
4. **Redis & Queues**: Verify server logs report:
   ```
   [Workers] All decoupled document workers active:
    - Extraction Queue: document-extraction
    - Embedding Queue: embedding
    - Knowledge Queue: knowledge-extraction
   ```
5. **Live Upload Test**: Upload an academic PDF, observe real-time Socket.IO processing, and execute an AI Tutor query to verify end-to-end RAG response.
