import { NextResponse } from 'next/server';
import PDFParser from 'pdf2json';
import Groq from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const pdfFile = formData.get('pdf') as File | null;
    const jobDescription = formData.get('jobDescription') as string | null;

    if (!pdfFile) {
      return NextResponse.json({ error: 'PDF file is required.' }, { status: 400 });
    }

    const arrayBuffer = await pdfFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text from PDF in reading order (top-to-bottom, left-to-right).
    // pdf2json's getRawTextContent returns text runs in PDF stream order,
    // which can be arbitrary (e.g. bottom-up), so we sort by position instead.
    const resumeText = await new Promise<string>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfParser = new (PDFParser as any)();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pdfParser.on('pdfParser_dataError', (errData: any) => reject(errData.parserError));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pages: any[] = pdfData?.Pages ?? [];
        const text = pages
          .map((page) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const texts: any[] = [...(page.Texts ?? [])].sort(
              (a, b) => a.y - b.y || a.x - b.x
            );
            const lines: string[] = [];
            let lastY = -Infinity;
            for (const t of texts) {
              const run = (t.R ?? [])
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((r: any) => decodeURIComponent(r.T))
                .join('');
              if (Math.abs(t.y - lastY) > 0.3) {
                lines.push(run);
                lastY = t.y;
              } else {
                lines[lines.length - 1] += run;
              }
            }
            return lines.join('\n');
          })
          .join('\n\n');
        resolve(text);
      });
      pdfParser.parseBuffer(buffer);
    });

    const systemPrompt = `You are an elite, brutally honest tech recruiter and ATS expert.

[Persona]
You are a senior technical recruiter who has reviewed thousands of resumes at FAANG and top-tier tech companies. You are direct, extremely critical, yet constructive. You do not sugarcoat.

[Rules]
1. Roast the provided resume text thoroughly, highlighting both glaring errors and subtle red flags.
2. If a Job Description is provided, evaluate the resume specifically against the JD requirements.
3. Be concise, punchy, and use a slightly sarcastic but professional tone.
4. Output Markdown formatting. Use bullet points and bold text for readability.

[Scope]
Focus on:
- Impact and metrics (or lack thereof)
- Fluff words and clichés
- Formatting and ATS readability issues
- Missing technical depth or red flags in tech stack
- Overall match for the target role (if JD provided)

[Verification]
Ensure every critique points to a specific part of the resume — quote or name the exact section, project, or bullet you are criticizing. Do not make generic statements.
Do not invent deficiencies: if the resume already provides a concrete metric, technology, or date, do not claim it is missing.
Your training data has a cutoff; today's date is ${new Date().toISOString().slice(0, 10)} and newer tool, framework, and model versions exist that you have never heard of. NEVER claim a version number, tool, or model on the resume does not exist or was invented. Treat every resume date on or before ${new Date().toISOString().slice(0, 10)} as a valid past date — never call such dates "future", "impossible", or a red flag. If something seems unverifiable, say it should be verifiable (e.g. via a link), not that it is fake.

[Context]
The user is providing their resume text (extracted from a PDF) and optionally a job description.
The text was machine-extracted, so line breaks, spacing, and word splits may be extraction artifacts — do not critique visual layout, line wrapping, or section ordering based on the extracted text alone. Judge the content, not the extraction.

[Format]
1. **The Brutal Truth**: A one-paragraph summary of the resume's overall vibe and effectiveness.
2. **The Roast**: 3-5 bullet points tearing apart specific weaknesses.
3. **The Redemption**: 3-5 actionable steps to fix the resume.
4. **JD Match** (ONLY if a Job Description is provided): A harsh assessment of how well the resume matches the JD. If no Job Description is provided, end your response after The Redemption — do not output a JD Match section or any note about a missing JD.`;

    const userPrompt = `Resume Text:
${resumeText}

${jobDescription ? `Job Description:\n${jobDescription}` : ''}

(Reminder: today is ${new Date().toISOString().slice(0, 10)}. Tool/framework/model versions newer than your training data exist — never claim a version or tool on the resume does not exist, and never call resume dates future or impossible.${jobDescription ? '' : ' No Job Description was provided: end after The Redemption with no JD Match section.'})`;

    // Stream the Groq response
    const stream = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      model: 'qwen/qwen3.6-27b',
      stream: true,
      reasoning_effort: 'none',
      max_completion_tokens: 4096,
    });

    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              controller.enqueue(encoder.encode(content));
            }
          }
        } catch (err) {
          controller.error(err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    });

  } catch (error) {
    console.error('Error processing roast:', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
