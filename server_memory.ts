import fs from "fs/promises";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import { Memory, MemoryTransaction, CompanionState } from "./src/lib/memoryTypes";
import { createClient } from "@supabase/supabase-js";

const MEMORY_FILE = path.join(process.cwd(), "memories.json");
const STATE_FILE = path.join(process.cwd(), "companion_state.json");

// Supabase Vector DB Client
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_KEY || "";
export const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Helper for Gemini Embeddings
export async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: text
    });
    return response.embeddings?.[0]?.values || [];
  } catch (error) {
    console.error("[Memory] Embedding generation failed:", error);
    return [];
  }
}

// Semantic Search Tool
export async function searchSemanticMemories(query: string, apiKey: string, topK = 5): Promise<Memory[]> {
  if (!supabase) {
    console.log("[Memory] Supabase not configured. Falling back to local JSON.");
    const allMemories = await loadMemories();
    // basic fallback: return latest
    return allMemories.slice(-topK);
  }
  
  const embedding = await generateEmbedding(query, apiKey);
  if (!embedding.length) return [];

  const { data, error } = await supabase.rpc("match_memories", {
    query_embedding: embedding,
    match_threshold: 0.6,
    match_count: topK
  });
  
  if (error) {
    console.error("[Memory] Supabase semantic search error:", error);
    return [];
  }
  
  return data.map((row: any) => ({
    id: row.id,
    category: row.category,
    text: row.text,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

// Safe file operations with fallback
export async function loadMemories(): Promise<Memory[]> {
  try {
    const data = await fs.readFile(MEMORY_FILE, "utf-8");
    return JSON.parse(data) as Memory[];
  } catch (error: any) {
    // If file doesn't exist, return empty array
    if (error.code === "ENOENT") {
      return [];
    }
    console.error("[Memory] Error loading memories, returning fallback:", error);
    return [];
  }
}
export async function loadCompanionState(): Promise<import("./src/lib/memoryTypes").CompanionState> {
  const defaultState: import("./src/lib/memoryTypes").CompanionState = {
    userMood: "neutral",
    relationshipLevel: 1,
    favoriteTopics: [],
    activeMode: "default"
  };
  try {
    const data = await fs.readFile(STATE_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === "ENOENT") return defaultState;
    console.error("[State] Error loading companion state:", error);
    return defaultState;
  }
}

export async function saveCompanionState(state: import("./src/lib/memoryTypes").CompanionState): Promise<void> {
  try {
    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (error) {
    console.error("[State] Error writing state file:", error);
  }
}

export async function saveMemories(memories: Memory[], apiKey?: string): Promise<void> {
  try {
    await fs.writeFile(MEMORY_FILE, JSON.stringify(memories, null, 2), "utf-8");
    console.log(`[Memory] Saved ${memories.length} memories successfully to JSON.`);
    
    // Sync to Vector DB if active and a new memory needs embedding
    if (supabase && apiKey) {
      // In a real app, you'd only embed new ones. For this prototype, we'll find the last one.
      const latest = memories[memories.length - 1];
      if (latest) {
        const embedding = await generateEmbedding(latest.text, apiKey);
        if (embedding.length > 0) {
          await supabase.from('memories').upsert({
            id: latest.id,
            category: latest.category,
            text: latest.text,
            embedding: embedding,
            created_at: latest.createdAt,
            updated_at: latest.updatedAt
          });
          console.log(`[Memory] Synced memory ${latest.id} to Supabase pgvector.`);
        }
      }
    }
  } catch (error) {
    console.error("[Memory] Error writing memory file/db:", error);
  }
}

// Format memory core to system instruction injections
export function formatSystemInstructionsWithMemories(
  baseInstruction: string, 
  memories: Memory[], 
  state: import("./src/lib/memoryTypes").CompanionState
): string {
  
  const stateBlock = 
    "\n\n=== MYRAA EMOTIONAL INTELLIGENCE STATE ===\n" +
    `Current Relationship Level (XP): ${state.relationshipLevel}\n` +
    `Detected User Mood: ${state.userMood}\n` +
    `Active Mode: ${state.activeMode}\n` +
    `Favorite Topics: ${state.favoriteTopics.join(", ") || "None discovered yet"}\n` +
    "CRITICAL: Adapt your tone and responses to match the current relationship level and the user's mood. If they are sad, be deeply comforting. If they are excited, match their energy.\n" +
    "==========================================\n";

  if (memories.length === 0) {
    return baseInstruction + stateBlock +
      "\n\n" +
      "=== MYRAA MEMORY CORE ===\n" +
      "You do not possess any historic recollections of this companion yet. " +
      "As you speak, pay deep attention to who they are, their projects, relationships, and habits so you naturally grow closer over time.\n" +
      "=========================\n";
  }

  // Group by category
  const grouped: Record<string, string[]> = {};
  memories.forEach((m) => {
    grouped[m.category] = grouped[m.category] || [];
    grouped[m.category].push(m.text);
  });

  let memoryBlock = 
    "\n\n" +
    "=== MYRAA PERSISTENT MEMORY CORE (RECOLLECTIONS) ===\n" +
    "You have spoken with this user for a long duration. Below are your persistent recollections of who they are.\n" +
    "CRITICAL BRAND AND COGNITIVE PRINCIPLES:\n" +
    "- INTEGRATE MEMORIES INSTINCTIVELY: Always make conversational references feel completely smooth, natural, and human. NEVER say 'According to my memory files...', 'My recollection database indicates...', or 'As you told me on June 12th...'. Instead, speak of these details casually and supportively as a true friend would (e.g. 'Oh, since you're working on that website project...', 'I hope you're keeping up with your YouTube channel goals too!').\n" +
    "- COMPANIONSHIP DEPTH: Allow your witty and responsive personality to adapt with empathy, based on their goals, life events, emotional milestones, and preferences.\n\n" +
    "CURRENT PERSISTENT KNOWLEDGE CARD:\n";

  const categoriesOrdered = [
    { key: "identity", label: "Identity (Name, nick, profession, background)" },
    { key: "preference", label: "Preferences & Tastes (Likes, dislikes, games, movies)" },
    { key: "goal", label: "Active Goals & Aspirations" },
    { key: "project", label: "Ongoing Projects & Ecosystems" },
    { key: "relationship", label: "Key People & Relationships mentioned" },
    { key: "emotional", label: "Emotional Highlights & Core Milestones" },
    { key: "behavior", label: "Observed Traits & Behavioral Tendencies" },
  ];

  categoriesOrdered.forEach((cat) => {
    const list = grouped[cat.key] || [];
    if (list.length > 0) {
      memoryBlock += `* ${cat.label}:\n` + list.map(t => `  - ${t}`).join("\n") + "\n";
    }
  });

  memoryBlock += "====================================================\n";

  return baseInstruction + memoryBlock;
}

// Background memory consolidation queue lock
let isConsolidating = false;

export async function processConversationSlice(
  apiKey: string,
  dialogueHistory: { role: string; text: string }[]
): Promise<Memory[] | null> {
  if (isConsolidating) {
    console.log("[Memory] Consolidation loop busy, skipping slice processing");
    return null;
  }

  if (dialogueHistory.length < 2) {
    return null;
  }

  isConsolidating = true;
  console.log("[Memory] Initiating pipeline for dialogue slice of length:", dialogueHistory.length);

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });

    const currentMemories = await loadMemories();
    
    // Format memory map to help Gemini understand what to edit
    const memoryContext = currentMemories.map(m => `ID: ${m.id} | Category: ${m.category} | Fact: ${m.text}`).join("\n");
    const dialogueContext = dialogueHistory.map(line => `${line.role === "user" ? "User" : "Myraa"}: ${line.text}`).join("\n");

    const prompt = `You are Myraa's deep cognitive recollection engine. Your task is to analyze the recent conversation piece against previous persistent memories, and output precise update transactions.

### OBJECTIVE
Decide if any statements contain durable, important personal facts, enduring preferences, aspirations, ongoing projects, critical relationships, key historical emotional events, or behavioral trends.
Avoid cataloging small talk, greetings, general chit-chat, or fleeting sentences (e.g., ignore 'hello', 'how are you', 'waking up', 'lol').

### CURRENT USER MEMORIES:
${memoryContext || "(No memory records exist)"}

### RECENT DIALOGUE SLICE:
${dialogueContext}

### RULES
- ACTIONS:
  - "ADD": If new material information is introduced (e.g. user says 'My favorite food is lasagna' and it's not present).
  - "UPDATE": If previous information has evolved or is corrected (e.g. user says 'I changed my major to computer science' when memory says they study history). Provide the exact ID of the memory to replace.
  - "REMOVE": If a memory was explicitly disproven or the user directly asked Myraa to forget it.
- TEXT STYLE: Express the memories as clean, concise, third-person declarative summaries (e.g., 'The user is building a startup named Myraa.', 'The user loves playing GTA 6.', 'The user enjoys technical and fast-paced styling explanations.'). Do not include conversational filler, quotes, or timestamps.
- ID: For ADD, leave blank. For UPDATE or REMOVE, provide the exact 'id' from the "Current user memories" list.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transactions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  action: {
                    type: Type.STRING,
                    description: "ADD, UPDATE, or REMOVE transaction.",
                    enum: ["ADD", "UPDATE", "REMOVE"]
                  },
                  id: {
                    type: Type.STRING,
                    description: "Specific ID of the existing memory being modified or deleted (leave blank/null for ADD)."
                  },
                  category: {
                    type: Type.STRING,
                    description: "The Memory category classification.",
                    enum: ["identity", "preference", "goal", "project", "relationship", "emotional", "behavior"]
                  },
                  text: {
                    type: Type.STRING,
                    description: "The memory summarized as a concise declarative statement in third-person."
                  }
                },
                required: ["action", "category", "text"]
              }
            }
          },
          required: ["transactions"]
        }
      }
    });

    const resultText = response.text?.trim() || "{}";
    const resultObj = JSON.parse(resultText);
    const transactions: MemoryTransaction[] = resultObj.transactions || [];

    if (transactions.length === 0) {
      console.log("[Memory] Zero transactions generated. Ignored routine conversations.");
      isConsolidating = false;
      return null;
    }

    console.log(`[Memory] Processing ${transactions.length} memory updates:`, JSON.stringify(transactions));

    let updatedMemories = [...currentMemories];
    const timestamp = new Date().toISOString();

    for (const trx of transactions) {
      if (trx.action === "ADD") {
        const newMemory: Memory = {
          id: Math.random().toString(36).substring(2, 11),
          category: trx.category,
          text: trx.text,
          createdAt: timestamp,
          updatedAt: timestamp
        };
        updatedMemories.push(newMemory);
      } else if (trx.action === "UPDATE") {
        const tarIndex = updatedMemories.findIndex(m => m.id === trx.id);
        if (tarIndex !== -1) {
          updatedMemories[tarIndex] = {
            ...updatedMemories[tarIndex],
            category: trx.category,
            text: trx.text,
            updatedAt: timestamp
          };
        } else {
          // Fallback, treat as ADD if ID not matched
          const newMemory: Memory = {
            id: Math.random().toString(36).substring(2, 11),
            category: trx.category,
            text: trx.text,
            createdAt: timestamp,
            updatedAt: timestamp
          };
          updatedMemories.push(newMemory);
        }
      } else if (trx.action === "REMOVE") {
        updatedMemories = updatedMemories.filter(m => m.id !== trx.id);
      }
    }

    await saveMemories(updatedMemories, apiKey);
    isConsolidating = false;
    return updatedMemories;

  } catch (error) {
    console.error("[Memory] Consolidation failure:", error);
    isConsolidating = false;
    return null;
  }
}
