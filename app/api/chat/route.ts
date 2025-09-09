import { AzureOpenAI } from "openai";
import { UIMessage } from "ai";
import { killDesktop } from "@/lib/e2b/utils";
import { prunedMessages } from "@/lib/utils";
import dotenv from "dotenv";

dotenv.config();

// Allow streaming responses up to 30 seconds
export const maxDuration = 300;

export async function POST(req: Request) {
  const { messages, sandboxId }: { messages: UIMessage[]; sandboxId: string } =
    await req.json();
  try {
    // Configure Azure OpenAI client
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT || "https://ai-radoslawgryga3465ai579522695324.cognitiveservices.azure.com/";
    const apiKey = process.env.AZURE_OPENAI_API_KEY || "43aXKuwwCgFvddXFFKMxXO8dfHA9Rt8Z2W76YY961D50Em5PX0hbJQQJ99BGACfhMk5XJ3w3AAAAACOGipRN";
    const apiVersion = "2025-01-01-preview";
    const deployment = "gpt-4.1";

    const client = new AzureOpenAI({ 
      endpoint, 
      apiKey, 
      apiVersion, 
      deployment 
    });

    // Convert UI messages to OpenAI format
    const openAIMessages = prunedMessages(messages).map(msg => {
      if (msg.role === 'user') {
        return {
          role: 'user' as const,
          content: msg.content
        };
      } else if (msg.role === 'assistant') {
        const textContent = msg.parts?.find(part => part.type === 'text')?.text || '';
        return {
          role: 'assistant' as const,
          content: textContent
        };
      }
      return {
        role: 'system' as const,
        content: msg.content
      };
    });

    // Add system message
    const messagesWithSystem = [
      {
        role: 'system' as const,
        content: "Jesteś asystentem AI, który ułatwia użytkownikom znajdowanie informacji. " +
                "Masz dostęp do komputera. " +
                "Używaj narzędzia komputera, aby pomóc użytkownikom w ich zadaniach. " +
                "Używaj narzędzia bash do wykonywania poleceń na komputerze. Możesz tworzyć pliki i foldery za pomocą narzędzia bash. Zawsze preferuj narzędzie bash, gdy jest to możliwe dla zadania. " +
                "Upewnij się, że informujesz użytkownika, gdy oczekiwanie jest konieczne. " +
                "Jeśli przeglądarka otworzy się z kreatorem konfiguracji, MUSISZ GO ZIGNOROWAĆ i przejść bezpośrednio do następnego kroku (np. wprowadź adres URL w pasku wyszukiwania)."
      },
      ...openAIMessages
    ];

    // Create completion with Azure OpenAI
    const response = await client.chat.completions.create({
      model: deployment, // Use the deployment name as model
      messages: messagesWithSystem,
      max_tokens: 16384,
      temperature: 0.7,
      top_p: 0.95,
      frequency_penalty: 0,
      presence_penalty: 0,
      stop: null,
      stream: true
    });

    // Create streaming response
    return new Response(
      new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of response) {
              const content = chunk.choices[0]?.delta?.content;
              if (content) {
                const data = `data: ${JSON.stringify({
                  choices: [{
                    delta: { content }
                  }]
                })}\n\n`;
                controller.enqueue(new TextEncoder().encode(data));
              }
            }
            controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`));
            controller.close();
          } catch (error) {
            console.error('Streaming error:', error);
            controller.error(error);
          }
        }
      }),
      {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      }
    );
  } catch (error) {
    console.error("Chat API error:", error);
    await killDesktop(sandboxId); // Force cleanup on error
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
