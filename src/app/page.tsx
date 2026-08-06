"use client";

import { useState, useRef, DragEvent, ChangeEvent } from "react";
import ReactMarkdown from "react-markdown";
import styles from "./page.module.css";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === "application/pdf") {
        setFile(droppedFile);
        setError("");
      } else {
        setError("Please upload a PDF file.");
      }
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type === "application/pdf") {
        setFile(selectedFile);
        setError("");
      } else {
        setError("Please upload a PDF file.");
      }
    }
  };

  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const removeFile = () => {
    setFile(null);
  };

  const handleSubmit = async () => {
    if (!file) {
      setError("Please upload a resume first.");
      return;
    }

    setIsLoading(true);
    setResult("");
    setError("");

    const formData = new FormData();
    formData.append("pdf", file);
    if (jobDescription) {
      formData.append("jobDescription", jobDescription);
    }

    try {
      const response = await fetch("/api/roast", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No reader available");
      }

      const decoder = new TextDecoder("utf-8");
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          setResult((prev) => prev + chunk);
        }
      }
    } catch (err: unknown) {
      console.error(err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={`${styles.header} ${styles.animateEnter}`}>
        <h1 className={styles.title}>
          Resume<span className="gradient-text">Roast</span>
        </h1>
        <p className={styles.subtitle}>
          Get brutal, AI-powered feedback on your resume. Upload your PDF, drop in an optional job description, and prepare to be roasted.
        </p>
      </header>

      <main className={`glass-panel ${styles.animateEnterDelay}`}>
        <div className={styles.form}>
          <div className={styles.fieldGroup}>
            <label className={styles.label}>Upload Resume (PDF)</label>
            {!file ? (
              <div
                className={`${styles.dropzone} ${isDragActive ? styles.dropzoneActive : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={triggerFileInput}
              >
                <svg
                  className={styles.uploadIcon}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <div className={styles.dropzoneText}>
                  Drag & Drop your resume here
                </div>
                <div className={styles.dropzoneSub}>or click to browse</div>
                <input
                  type="file"
                  accept="application/pdf"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />
              </div>
            ) : (
              <div className={styles.fileSelected}>
                <svg
                  width="24"
                  height="24"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span className={styles.fileSelectedName}>{file.name}</span>
                <button
                  className={styles.removeFileBtn}
                  onClick={removeFile}
                  title="Remove file"
                  aria-label="Remove file"
                >
                  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="jobDescription">
              Job Description (Optional)
            </label>
            <textarea
              id="jobDescription"
              className={styles.textarea}
              placeholder="Paste the job description you are targeting..."
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
            />
          </div>

          {error && <div className={styles.errorBox}>{error}</div>}

          <button
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={!file || isLoading}
          >
            {isLoading ? "Roasting..." : "Roast My Resume"}
          </button>
        </div>
      </main>

      {(result || isLoading) && (
        <section className={`glass-panel ${styles.resultSection}`}>
          <h2 className={styles.resultTitle}>
            The Verdict {isLoading && <div className={styles.loadingSpinner}></div>}
          </h2>
          <div className="markdown-body">
            <ReactMarkdown>{result || "Analyzing your resume..."}</ReactMarkdown>
          </div>
        </section>
      )}
    </div>
  );
}
