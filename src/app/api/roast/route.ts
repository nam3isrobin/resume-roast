import { NextResponse } from 'next/server';
import PDFParser from 'pdf2json';
import Groq from 'groq-sdk';

const MAX_PDF_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_JOB_DESCRIPTION_LENGTH = 20_000;
const PDF_MAGIC_BYTES = Buffer.from('%PDF-');

export async function POST(req: Request) {
  try {
    if (!process.env.GROQ_API_KEY) {
      console.error('GROQ_API_KEY is not configured.');
      return NextResponse.json({ error: 'Service is not configured.' }, { status: 503 });
    }

    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    const formData = await req.formData();
    const pdfFile = formData.get('pdf');
    const jobDescriptionField = formData.get('jobDescription');

    if (!(pdfFile instanceof File)) {
      return NextResponse.json({ error: 'PDF file is required.' }, { status: 400 });
    }

    if (pdfFile.size > MAX_PDF_SIZE_BYTES) {
      return NextResponse.json({ error: 'PDF file must be 5MB or smaller.' }, { status: 413 });
    }

    const jobDescription = typeof jobDescriptionField === 'string' ? jobDescriptionField : null;
    if (jobDescription && jobDescription.length > MAX_JOB_DESCRIPTION_LENGTH) {
      return NextResponse.json(
        { error: 'Job description must be 20,000 characters or fewer.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await pdfFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!buffer.subarray(0, PDF_MAGIC_BYTES.length).equals(PDF_MAGIC_BYTES)) {
      return NextResponse.json({ error: 'Uploaded file is not a valid PDF.' }, { status: 400 });
    }

    // Extract text from PDF
    const resumeText = await new Promise<string>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfParser = new (PDFParser as any)(null, 1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pdfParser.on('pdfParser_dataError', (errData: any) => reject(errData.parserError));
      pdfParser.on('pdfParser_dataReady', () => {
        resolve(pdfParser.getRawTextContent());
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
Ensure every critique points to a specific part of the resume. Do not make generic statements.

[Context]
The user is providing their resume text (extracted from a PDF) and optionally a job description.

[Format]
1. **The Brutal Truth**: A one-paragraph summary of the resume's overall vibe and effectiveness.
2. **The Roast**: 3-5 bullet points tearing apart specific weaknesses.
3. **The Redemption**: 3-5 actionable steps to fix the resume.
4. **JD Match** (only if Job Description is provided): A harsh assessment of how well the resume matches the JD.`;

    const userPrompt = `Resume Text:
${resumeText}

${jobDescription ? `Job Description:\n${jobDescription}` : ''}`;

    // Stream the Groq response
    const stream = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      model: 'qwen/qwen3.6-27b',
      stream: true,
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
