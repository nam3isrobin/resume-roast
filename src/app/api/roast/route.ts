import { NextResponse } from 'next/server';
import PDFParser from 'pdf2json';
import Groq from 'groq-sdk';

export async function POST(req: Request) {
  try {
    if (!process.env.GROQ_API_KEY) {
      console.error('GROQ_API_KEY is not set.');
      return NextResponse.json(
        { error: 'Server is misconfigured: missing API key.' },
        { status: 500 }
      );
    }

    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    const formData = await req.formData();
    const pdfFile = formData.get('pdf') as File | null;
    const jobDescription = formData.get('jobDescription') as string | null;

    if (!pdfFile) {
      return NextResponse.json({ error: 'PDF file is required.' }, { status: 400 });
    }

    const arrayBuffer = await pdfFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text from PDF
    let resumeText: string;
    try {
      resumeText = await new Promise<string>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pdfParser = new (PDFParser as any)(null, 1);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pdfParser.on('pdfParser_dataError', (errData: any) => {
          const cause = errData?.parserError ?? errData;
          reject(cause instanceof Error ? cause : new Error(String(cause)));
        });
        pdfParser.on('pdfParser_dataReady', () => {
          resolve(pdfParser.getRawTextContent());
        });
        pdfParser.parseBuffer(buffer);
      });
    } catch (parseError) {
      console.error('Failed to parse PDF:', parseError);
      return NextResponse.json(
        { error: 'Failed to parse the PDF. Please make sure it is a valid, uncorrupted PDF file.' },
        { status: 422 }
      );
    }

    if (!resumeText.trim()) {
      return NextResponse.json(
        { error: 'No text could be extracted from the PDF. Scanned or image-only PDFs are not supported.' },
        { status: 422 }
      );
    }

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
          controller.close();
        } catch (err) {
          console.error('Error while streaming Groq response:', err);
          controller.error(err);
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
    if (error instanceof Groq.APIError) {
      return NextResponse.json(
        { error: `The AI service returned an error (${error.status ?? 'unknown'}). Please try again later.` },
        { status: 502 }
      );
    }
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
