import Link from "next/link";
import { Bot, Plus } from "lucide-react";

export default function HomePage(): React.ReactElement {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bot className="h-8 w-8 text-blue-500" />
          <h1 className="text-2xl font-bold">Agent Studio</h1>
        </div>
        <Link
          href="/agents/new"
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Agent
        </Link>
      </div>
      <p className="text-zinc-400">
        Build AI agents with knowledge bases, web scraping, and RAG — locally.
      </p>
    </main>
  );
}
