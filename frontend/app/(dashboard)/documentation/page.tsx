"use client";

import {
  BookOpen,
  Bot,
  ExternalLink,
  Phone,
  Webhook,
  Code2,
  MessageSquare,
  Mic,
  Settings,
} from "lucide-react";
import Link from "next/link";

const DOCS_URL = "https://docs.resona.ai";

export default function DocumentationPage() {
  return (
    <div className="animate-fade-in max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-white tracking-tight">
          Documentation
        </h1>
        <p className="text-white/70 mt-1">
          How Resona works, and where to find the full API reference.
        </p>
      </div>

      <div className="glass-card p-6 mb-6 border-[#4DFFCE]/20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#4DFFCE]/20 flex items-center justify-center">
              <BookOpen size={24} className="text-[#4DFFCE]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Full API &amp; reference
              </h2>
              <p className="text-sm text-white/70">
                Complete API docs, webhooks, and SDKs at docs.resona.ai
              </p>
            </div>
          </div>
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary inline-flex items-center gap-2"
          >
            Open docs.resona.ai
            <ExternalLink size={14} />
          </a>
        </div>
      </div>

      <div className="space-y-6">
        <section className="glass-card p-6">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-4">
            <Bot size={20} className="text-[#4DFFCE]" />
            How Resona works
          </h2>
          <p className="text-white/70 leading-relaxed mb-4">
            Resona is a voice AI platform. You create <strong className="text-white">agents</strong> that
            answer and make phone calls using natural speech. Each agent has a
            system prompt, first message, voice, and language. Resona handles
            speech-to-text, LLM responses, and text-to-speech in real time.
          </p>
          <ul className="space-y-2 text-white/70">
            <li className="flex items-start gap-2">
              <span className="text-[#4DFFCE] mt-0.5">•</span>
              <span><strong className="text-white">Agents</strong> — Define personality, voice, and behaviour. Test in the dashboard or over the phone.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#4DFFCE] mt-0.5">•</span>
              <span><strong className="text-white">Calls</strong> — Inbound and outbound calls, plus browser-based test calls. Transcripts and metadata are stored.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#4DFFCE] mt-0.5">•</span>
              <span><strong className="text-white">Knowledge base</strong> — Add context (FAQ, docs) that agents can use during conversations.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#4DFFCE] mt-0.5">•</span>
              <span><strong className="text-white">Webhooks</strong> — Get notified when calls start, end, or when specific events occur.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#4DFFCE] mt-0.5">•</span>
              <span><strong className="text-white">API</strong> — Create and manage agents, list calls, and trigger outbound calls programmatically.</span>
            </li>
          </ul>
        </section>

        <section className="glass-card p-6">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-4">
            <Code2 size={20} className="text-[#4DFFCE]" />
            API overview
          </h2>
          <p className="text-white/70 leading-relaxed mb-4">
            The Resona API is RESTful and uses JSON. Authenticate with an API key
            from <Link href="/settings" className="text-[#4DFFCE] hover:underline">Settings → API Keys</Link>.
            Base URL is your deployment (e.g. <code className="px-1.5 py-0.5 rounded bg-white/10 text-white/90 text-sm">https://api.resona.ai</code> or your self-hosted URL).
          </p>
          <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
            <div className="px-4 py-2 border-b border-white/10 text-xs font-medium text-white/70 uppercase tracking-wide">
              Example endpoints
            </div>
            <div className="p-4 space-y-2 font-mono text-sm text-white/90">
              <div><span className="text-[#4DFFCE]">GET</span>  /v1/agents — List agents</div>
              <div><span className="text-[#4DFFCE]">POST</span> /v1/agents — Create agent</div>
              <div><span className="text-[#4DFFCE]">GET</span>  /v1/agents/:id — Get agent</div>
              <div><span className="text-[#4DFFCE]">PATCH</span> /v1/agents/:id — Update agent</div>
              <div><span className="text-[#4DFFCE]">GET</span>  /v1/calls — List calls</div>
              <div><span className="text-[#4DFFCE]">POST</span> /v1/calls — Start outbound call</div>
              <div><span className="text-[#4DFFCE]">GET</span>  /v1/voices — List voices</div>
            </div>
          </div>
          <p className="text-white/70 text-sm mt-4">
            For request/response schemas, webhooks, and SDKs, see the full docs.
          </p>
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-3 text-[#4DFFCE] hover:underline text-sm font-medium"
          >
            Full API reference at docs.resona.ai
            <ExternalLink size={12} />
          </a>
        </section>

        <section className="glass-card p-6">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-4">
            <Settings size={20} className="text-[#4DFFCE]" />
            Quick links
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link
              href="/agents"
              className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-[#4DFFCE]/30 transition-colors"
            >
              <Bot size={20} className="text-[#4DFFCE]" />
              <span className="text-white font-medium">Agents</span>
            </Link>
            <Link
              href="/calls"
              className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-[#4DFFCE]/30 transition-colors"
            >
              <Phone size={20} className="text-[#4DFFCE]" />
              <span className="text-white font-medium">Calls</span>
            </Link>
            <Link
              href="/knowledge-base"
              className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-[#4DFFCE]/30 transition-colors"
            >
              <MessageSquare size={20} className="text-[#4DFFCE]" />
              <span className="text-white font-medium">Knowledge base</span>
            </Link>
            <Link
              href="/webhooks"
              className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-[#4DFFCE]/30 transition-colors"
            >
              <Webhook size={20} className="text-[#4DFFCE]" />
              <span className="text-white font-medium">Webhooks</span>
            </Link>
            <Link
              href="/settings"
              className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-[#4DFFCE]/30 transition-colors"
            >
              <Settings size={20} className="text-[#4DFFCE]" />
              <span className="text-white font-medium">Settings & API keys</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
