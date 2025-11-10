# Code Chatbot

Created November 2024<br>
An application designed to assist developers by providing an interactive chat interface to discuss and analyze their code files.

## Table of contents
* [Prerequisites](#prerequisites)
* [Executing Program](#executing-program)
* [Key Features](#key-features)
* [Testing](#testing)
* [Inspiration](#inspiration)
* [Future Development](#future-development)
* [Contact](#contact)


## Prerequisites

Ensure you have the following installed on your local machine:

1. **Docker and Docker Compose**  
   Docker enables containerization of applications, while Docker Compose allows orchestration of multi-container setups.

   - **Docker:** [Download Docker](https://docs.docker.com/get-docker/)
   - **Docker Compose:** [Install Docker Compose](https://docs.docker.com/compose/install/)


2. **Node.js (Optional)**  
   If you plan to run the frontend and backend without Docker for development purposes.
   
   - **Node.js:** [Download Node.js](https://nodejs.org/en/download/)


## Executing Program

Create the backend `.env` file with the required credentials and configuration:
```
# backend/.env

PORT=5001
OPENAI_API_KEY=sk-...
PINECONE_API_KEY=pc-...
PINECONE_INDEX=code-embeddings
FRONTEND_ORIGIN=http://localhost:3000
# Optional overrides
# DATABASE_FILE=data/app.db
# MAX_HISTORY_MESSAGES=10
# MAX_CHUNK_TOKENS=800
# CHUNK_OVERLAP_TOKENS=200
# MIN_PINECONE_SCORE=0.75
```

Install dependencies and launch the stack:

```bash
# backend
cd backend
npm install

# frontend
cd ../frontend
npm install

# Docker
cd ..
docker-compose up -d --build
```

The React application respects `REACT_APP_API_BASE_URL` (defaults to `http://localhost:5001`) so the frontend can proxy to production instances without code changes.

### Local-only workflow

If you prefer to run outside Docker, start each service in separate terminals:

```bash
cd backend && npm start    # add a start script or use nodemon
cd frontend && npm start
```

The backend persists metadata in `backend/data/app.db` (SQLite). Delete that file if you need a clean slate.

## Key Features

- Deterministic file chunking with overlap, deduplicated via SHA-256 prior to embedding.
- Asynchronous Pinecone ingestion queue with detailed status tracking (queued → processing → ready/failed).
- Persistent chat sessions backed by SQLite plus streaming responses over Server-Sent Events.
- Source citations in every answer referencing filename and line ranges.
- Toast-driven UX for uploads/deletions, status badges for file processing, and configurable API base URL.

## Testing

Run lightweight smoke tests for hashing/chunking logic:

```bash
cd backend
npm test
```

End-to-end verification still requires valid OpenAI & Pinecone credentials; trigger an upload and `/ask` request once your API keys are provisioned.


## Inspiration

I was recently put into a project with huge extensive codebase and complex code without sufficient documentation and comments, making it really difficult for me to fully understand. This inspired me to create Code Chatbot which utilizes the implementation of RAG that allow users to upload multiple files and chat with them. 

## Future Development

Multiple chat rooms, better looking UI, real-time collaboration with multiple users, integrate tools for deeper code analysis

## Contact

This project was created by [Warren Chang](https://www.linkedin.com/in/warren-chang-215644229/) - Feel free to contact me if you have any questions :)
