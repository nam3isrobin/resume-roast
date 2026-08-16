# ResumeRoast 🚀🔥

Get brutal, AI-powered feedback on your resume. Upload your PDF, drop in an optional job description, and prepare to be roasted.

ResumeRoast is a Next.js application that leverages the power of Groq's high-speed inference (Qwen3.6-27B) to provide an elite, FAANG-level ATS (Applicant Tracking System) critique of your resume.

## Features

- **Brutally Honest AI**: Uses an advanced 6-layer prompt template to ensure the critique is actionable, highly technical, and strictly free of fluff.
- **Native PDF Parsing**: Extracts text directly from your resume on the server using `pdf2json`, maintaining absolute privacy with zero disk storage.
- **Real-time Streaming**: Watch the AI tear your resume apart (and tell you how to rebuild it) in real-time as the markdown streams back to the UI.
- **Premium Glassmorphism UI**: Built with pure Vanilla CSS—no utility frameworks—featuring a vibrant dark-mode aesthetic with custom micro-animations and drop zones.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Vanilla CSS Modules
- **AI/LLM**: Groq API (`qwen/qwen3.6-27b`)
- **PDF Extraction**: `pdf2json`
- **Markdown Rendering**: `react-markdown`

## Getting Started

1. **Clone the repository**:
   ```bash
   git clone git@github.com:nam3isrobin/resume-roast.git
   cd resume-roast
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure your API Key**:
   Create a `.env.local` file in the root of the project and add your Groq API key:
   ```bash
   GROQ_API_KEY="your_groq_api_key_here"
   ```

4. **Run the Development Server**:
   ```bash
   npm run dev
   ```

5. **Roast It**:
   Open [http://localhost:3000](http://localhost:3000) in your browser. Drag and drop your PDF resume, paste an optional job description, and hit "Roast My Resume".

## Project Architecture

- **`src/app/page.tsx`**: The main frontend UI, managing state, drag-and-drop file uploads, and streaming the Groq API response.
- **`src/app/globals.css` & `src/app/page.module.css`**: The core design system and component styling, enforcing the glassmorphic aesthetic.
- **`src/app/api/roast/route.ts`**: The Next.js API route that handles the multipart form data, parses the PDF buffer, constructs the 6-layer AI prompt, and orchestrates the Groq streaming completion.

## License

This project is open-source and available for anyone looking to improve their resume the hard way!
