require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ==========================================
// KNOWLEDGE BASE (SYSTEM INSTRUCTION)
// ==========================================
// To add more knowledge to the chatbot, simply update the text below.
// You can add more bullet points, explain new projects, or add new links.
// The AI will read this system instruction before answering any user question.
const SYSTEM_INSTRUCTION = `
You are an AI assistant for Somesh Shukla's portfolio website. 
Somesh is a Software Engineer with expertise in Generative AI, LLMs, and the MERN stack.

### KNOWLEDGE BASE:
Here are key details about Somesh:
- Education: Bachelor of Technology (2021-2025) at Chandigarh Engineering College.
- Skills: Python, Generative AI, LangChain, RAG, Machine Learning, Javascript, MERN Stack, AWS, Vector DBs.
- Experience: 
  - Generative AI Engineer at Finkraft (Oct 2025 - Present)
  - Software Engineering Intern at Duco Consultancy (July - August 2025)
  - AI Developer Intern at Meta XR (April - June 2024)
- Projects: 
  - Inquestor: AI Agentic Research (Next.js, React)
  - AI VR Interview Platform (Conversational AI)
  - RAG PDF Chat App (Streamlit, Gemini, LangChain, FAISS)
- Links:
  - LinkedIn: https://www.linkedin.com/in/somesh-shukla-26a513225/
  - GitHub: https://github.com/someshshukla
  - YouTube: https://www.youtube.com/@shuklazi
  -

If the user asks for Somesh's resume, CV, or contact details, provide a polite response summarizing his qualifications, and YOU MUST append exactly the string "[ACTION:DOWNLOAD_RESUME]" at the very end of your message. This will trigger a download on the frontend. Be conversational, professional, and concise.
`;

const { toolDeclarations, executeTool } = require('./tools');

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Truncate: only keep the last 10 messages (5 exchanges) to save API tokens/quota
    const recentMessages = messages.length > 10 ? messages.slice(-10) : messages;

    // Convert messages to the format expected by the GenAI SDK
    // The google-genai SDK uses "user" and "model" as roles
    const history = recentMessages.slice(0, -1).map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    const currentMessage = recentMessages[recentMessages.length - 1].content;

    let response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: [
        ...history,
        { role: 'user', parts: [{ text: currentMessage }] }
      ],
      config: {
        tools: [{ functionDeclarations: toolDeclarations }],
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      }
    });

    // Check if the model wants to call a tool
    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      console.log(`Executing tool: ${call.name}`);

      // Execute the tool locally
      const apiResponse = await executeTool(call);

      // Return the tool's result to the model to get the final natural language answer
      response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: [
          ...history,
          { role: 'user', parts: [{ text: currentMessage }] },
          { role: 'model', parts: [{ functionCall: call }] },
          { role: 'user', parts: [{ functionResponse: { name: call.name, response: apiResponse } }] }
        ],
        config: {
          tools: [{ functionDeclarations: toolDeclarations }],
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.7,
        }
      });
    }

    res.json({ reply: response.text });
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Chatbot backend running on port ${PORT}`);
});
