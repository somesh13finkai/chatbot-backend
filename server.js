require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(cors());
app.use(express.json());


const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ==========================================
// KNOWLEDGE BASE (SYSTEM INSTRUCTION)
// ==========================================
// To add more knowledge to the chatbot, simply update the text below.
// You can add more bullet points, explain new projects, or add new links.
// The AI will read this system instruction before answering any user question.
const SYSTEM_INSTRUCTION = `

`;

const { toolDeclarations, executeTool } = require('./tools');

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const recentMessages = messages.length > 10 ? messages.slice(-10) : messages;

    
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

    
    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      console.log(`Executing tool: ${call.name}`);

      
      const apiResponse = await executeTool(call);

   
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
