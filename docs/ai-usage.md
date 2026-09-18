# AI & Machine Learning Architecture

This document details the AI architecture, model selection, prompt strategies, RAG implementation, and evaluation mechanics in **AI Study Companion**.

---

## 1. Multi-Model Topology

The system uses a heterogeneous multi-model strategy separating vector representations from textual reasoning:

| Layer | Provider | Model | Parameters / Specs | Primary Role |
| :--- | :--- | :--- | :--- | :--- |
| **Vector Embeddings** | Cohere | `embed-v4.0` | 1024 dimensions, float | Document chunk & retrieval query vectorization |
| **Primary LLM Reasoning** | Groq | `openai/gpt-oss-120b` | 120B parameters | AI Tutor conversational answers, deep conceptual explanations |
| **Fast Generation** | Groq | `openai/gpt-oss-20b` | 20B parameters | Concept extraction, adaptive quiz questions, open-ended rubric evaluation |

---

## 2. Vector Embedding & Retrieval Pipeline (Cohere Embed v4.0)

### 2.1 Model & Configuration
- **Model**: `embed-v4.0`
- **Output Dimensions**: `1024`
- **Batch Size**: `32` chunks per request
- **Embedding Type**: `float`

### 2.2 Asymmetric Search Embeddings
Cohere's Embed API separates document chunk ingestion from query embedding to optimize cosine similarity in semantic vector spaces:
- **Chunk Embeddings**: Generated during background ingestion using `input_type="search_document"`.
- **Query Embeddings**: Generated during interactive student queries using `input_type="search_query"`.

### 2.3 MongoDB Atlas Vector Search
Chunks are indexed using an Atlas Vector Search index named `vector_index` defined on the `chunks` collection:
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

### 2.4 Grounded Citation Verification
Each retrieved chunk includes metadata:
- `materialId`: MongoDB ID of parent document.
- `pageNumber`: Precise page number from source PDF.
- `chunkIndex`: Position of the chunk in the document.

The AI Tutor is instructed to only assert claims that can be directly mapped to source chunks and return citations with verified page numbers.

---

## 3. Concept Extraction & Knowledge Graphs

When new study material is processed:
1. Chunks are aggregated and fed into the fast LLM model (`openai/gpt-oss-20b`).
2. The model extracts:
   - **Concept Name**: Canonical identifier (e.g., "Backpropagation", "Merge Sort").
   - **Description**: Concise textbook-level explanation.
   - **Prerequisites**: List of prerequisite concepts needed for comprehension.
   - **Estimated Difficulty**: `easy`, `medium`, or `hard`.
3. Concepts are stored in the `Concept` collection, linking to the project and creating a searchable domain knowledge graph.

---

## 4. Adaptive Assessment & Quiz Generation

### 4.1 Question Generation
Quizzes are generated on-demand based on concepts extracted from the project:
- **Difficulty Adaptation**: Automatically chooses `adaptive`, `easy`, `medium`, or `hard` based on the student's current mastery scores.
- **Formats**: Multiple Choice Questions (MCQs) with 4 options and plausible distractors, plus open-ended conceptual questions.
- **Explanations**: Pre-generated pedagogical explanations highlighting why the correct choice is accurate.

### 4.2 Open-Ended Answer Evaluation
When a student answers an open-ended question:
1. The student's written response is evaluated against the question rubric and expected key points.
2. The LLM performs holistic scoring (0 to 100%) evaluating:
   - **Understanding**: Grasp of fundamental principles.
   - **Accuracy**: Factual correctness of assertions.
   - **Relevance**: Direct responsiveness to the question prompt.
   - **Key Concepts Covered**: Sub-concepts mentioned.
   - **Missing Concepts**: Points overlooked.
   - **Constructive Reasoning**: Personalized feedback guiding improvement.

---

## 5. Mastery Tracking & Spaced Repetition Engine

- **Mastery Levels**: Each concept tracks a level from 1 (Novice) to 5 (Mastery).
- **Update Formula**: Quiz scores, attempt frequency, and recency dynamically adjust mastery score and confidence percentages.
- **Decay Simulation**: Concepts unassessed for extended periods experience time-based confidence decay, prompting targeted review recommendations.

---

## 6. AI Usage Auditing & Cost Analytics

Every call to an external AI service is automatically audited through the `AIUsage` model:
- `userId` & `projectId`: Strict ownership attribution.
- `feature`: Categorized as `TUTOR`, `QUIZ`, `CONCEPT`, `ASSESSMENT`, or `EMBEDDING`.
- `model`: Exact model name invoked (e.g., `openai/gpt-oss-120b`, `embed-v4.0`).
- `inputTokens` & `outputTokens`: Token consumption reported by SDK responses.
- `latencyMs`: Execution time in milliseconds.
- `success`: Boolean execution status with error logs upon failure.

The Admin Dashboard provides real-time multi-line graphs, model breakdowns, and daily invocation timelines derived from these records.
