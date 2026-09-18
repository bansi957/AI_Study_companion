import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { normalizeMathNotation } from "../../../../utils/mathUtils";
import {
  Sparkles,
  Send,
  Bot,
  User,
  BookOpen,
  FileText,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  HelpCircle,
  ShieldCheck,
  BrainCircuit,
  MessageSquare,
  Clock,
  Plus,
  Check,
  Copy,
} from "lucide-react";
import {
  useAskTutorMutation,
  useGetLatestConversationQuery,
  useGetProjectConversationsQuery,
  useLazyGetConversationQuery,
} from "../../../../features/tutor/tutorApi";
import { Button } from "../../../../components/ui/Button";
import { Badge } from "../../../../components/ui/Badge";
import { EmptyState } from "../../../../components/ui/EmptyState";
import toast from "react-hot-toast";

const CodeBlock = ({ inline, className, children, ...props }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";
  const codeString = String(children || "").replace(/\n$/, "");
  const isBlock = !inline && (Boolean(language) || codeString.includes("\n"));

  if (!isBlock) {
    return (
      <code
        className="px-1.5 py-0.5 rounded bg-slate-900/90 text-indigo-300 font-mono text-[12px] border border-slate-700/60"
        {...props}
      >
        {children}
      </code>
    );
  }

  const handleCopy = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(codeString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="my-3.5 rounded-xl overflow-hidden border border-slate-700/80 bg-slate-950/90 shadow-sm text-left">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-900/90 border-b border-slate-800/90 text-[11px] font-mono">
        <span className="uppercase tracking-wider font-semibold text-slate-400">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 text-[10.5px]">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span className="text-[10.5px]">Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-3.5 overflow-x-auto text-[12.5px] font-mono leading-relaxed text-slate-200">
        <pre className="!bg-transparent !p-0 !m-0">
          <code>{codeString}</code>
        </pre>
      </div>
    </div>
  );
};

export const TutorTab = ({
  project,
  space,
  materials = [],
  growth,
  onSwitchTab,
  onTutorMessage,
}) => {
  const readyMaterials = materials.filter((m) => m.status === "READY");
  const [askTutor, { isLoading }] = useAskTutorMutation();

  const [conversationId, setConversationId] = useState(null);
  const [inputMessage, setInputMessage] = useState("");
  const [expandedSources, setExpandedSources] = useState({});
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);

  // Load latest conversation and list of conversations for this project
  const {
    data: latestConversation,
    isLoading: isLoadingLatest,
    isFetching: isFetchingLatest,
  } = useGetLatestConversationQuery(project?._id, {
    skip: !project?._id,
  });

  const {
    data: conversations = [],
    isLoading: isLoadingConvos,
  } = useGetProjectConversationsQuery(project?._id, {
    skip: !project?._id,
  });

  const [fetchConversation, { isFetching: isLoadingSpecific }] =
    useLazyGetConversationQuery();

  // Reset when project changes
  useEffect(() => {
    setConversationId(null);
    setMessages([]);
    setExpandedSources({});
  }, [project?._id]);

  // Load previous messages from latestConversation on mount
  useEffect(() => {
    if (latestConversation && !conversationId) {
      setConversationId(latestConversation._id);
      if (Array.isArray(latestConversation.messages)) {
        setMessages(
          latestConversation.messages.map((m, idx) => ({
            id: m._id || `${idx}`,
            role: m.role,
            content: m.content,
            supported: m.role === "assistant" ? true : undefined,
            sources: m.sources || [],
            createdAt: m.createdAt,
          }))
        );
      }
    }
  }, [latestConversation]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const starterQuestions = [
    "What are the core concepts covered in my uploaded materials?",
    "Explain the foundational principles with real-world examples.",
    "What are the most common misconceptions or pitfalls I should avoid?",
    "Generate a 3-step study roadmap based on these documents.",
  ];

  const handleOpenPdf = (src) => {
    if (!src) return;
    let url = src.fileUrl;
    if (!url && src.materialId && Array.isArray(materials)) {
      const match = materials.find((m) => String(m._id) === String(src.materialId));
      if (match?.fileUrl) url = match.fileUrl;
    }
    if (!url) {
      toast.error("PDF URL not available for this citation.");
      return;
    }
    const pageNum = parseInt(src.page, 10) || 1;
    const targetUrl = pageNum > 1 ? `${url}#page=${pageNum}` : `${url}#page=1`;
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  };

  const cleanMarkdownContent = (rawText = "") => {
    if (!rawText || typeof rawText !== "string") return "";

    let cleaned = rawText;

    // 1. Remove accidental or legacy Sources / Citations / References heading and following lines
    cleaned = cleaned.replace(/\n\s*#{1,4}\s*(Sources|Citations|References)\b[\s\S]*$/i, "");

    // 2. Remove [Source: ...] or (Source: ...)
    cleaned = cleaned.replace(/\[\s*Sources?:\s*[^\]]*\]/gi, "");
    cleaned = cleaned.replace(/\(\s*Sources?:\s*[^)]*\)/gi, "");

    // 3. Remove raw Cloudinary or PDF URLs
    cleaned = cleaned.replace(/https?:\/\/res\.cloudinary\.com\/[^\s\)]+/gi, "");
    cleaned = cleaned.replace(/https?:\/\/[^\s\)]+\.pdf(?:#[^\s\)]*)?/gi, "");

    // 4. Clean up any raw markdown citation links like [1](http...) -> [1]
    cleaned = cleaned.replace(/\[(\d+|Source)\]\((?:https?:\/\/[^\)]+|#page=\d+)\)/gi, (match, p1) => {
      return /^\d+$/.test(p1) ? `[${p1}]` : "";
    });

    // 5. Remove HTML/SVG markup artifacts
    cleaned = cleaned.replace(/<svg[\s\S]*?<\/svg>/gi, "");
    cleaned = cleaned.replace(/<\/?(?:svg|path|g|div|span|p|br|hr)[^>]*>/gi, "");
    cleaned = cleaned.replace(/\bsvg\b(?=\s*[\/>])/gi, "");

    // 6. Clean trailing separator lines (--- or ***)
    cleaned = cleaned.replace(/(\r?\n|\r)\s*[-_*]{3,}\s*$/g, "");

    // 7. Remove duplicate inline citations like [1, 1] -> [1] and [1][1], [1] [1], [1], [1], [1] and [1] -> [1]
    cleaned = cleaned.replace(/\[(\d+)(?:\s*,\s*\1)+\]/g, "[$1]");
    cleaned = cleaned.replace(/(\[\d+\])(?:\s*(?:,|and|&)?\s*\1)+/gi, "$1");

    return cleaned.trim();
  };

  const prepareMarkdownWithCitations = (text, citationMap) => {
    if (!text) return "";
    // Handle both single [1] and multi-citations like [1, 2]
    return text.replace(/\[([\d\s,]+)\]/g, (match, inner) => {
      const parts = inner.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
      if (parts.length === 0) return match;
      const allKnown = parts.every((n) => citationMap.has(n));
      if (!allKnown) return match;
      return parts.map((n) => `[${n}](#citation-${n})`).join(", ");
    });
  };

  const renderMessageContent = (content, sources = []) => {
    if (!content) return null;

    const cleaned = cleanMarkdownContent(content);
    const mathNormalized = normalizeMathNotation(cleaned);

    // Defensive deduplication of sources by unique document page
    const uniqueSources = [];
    const seenPageKeys = new Set();
    (sources || []).forEach((s) => {
      const pageNum = parseInt(s.page || (s.pages && s.pages[0]) || 1, 10);
      const key = `${String(s.materialId || s.materialName || "")}_${pageNum}`;
      if (!seenPageKeys.has(key)) {
        seenPageKeys.add(key);
        uniqueSources.push(s);
      }
    });

    const citationMap = new Map();
    uniqueSources.forEach((s, idx) => {
      const num = s.citationIndex || idx + 1;
      citationMap.set(num, s);
    });

    const prepared = prepareMarkdownWithCitations(mathNormalized, citationMap);

    return (
      <div className="markdown-body text-slate-200 text-sm">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            p: ({ children }) => (
              <p className="mb-3 last:mb-0 leading-relaxed text-slate-200 text-sm">
                {children}
              </p>
            ),
            h1: ({ children }) => (
              <h1 className="text-base sm:text-lg font-bold text-white mt-4 mb-2 first:mt-0 tracking-tight">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-sm sm:text-base font-semibold text-white mt-3.5 mb-2 first:mt-0 tracking-tight">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-xs sm:text-sm font-semibold text-white mt-3 mb-1.5 first:mt-0 tracking-tight">
                {children}
              </h3>
            ),
            h4: ({ children }) => (
              <h4 className="text-[11px] font-semibold text-slate-300 mt-2.5 mb-1 first:mt-0 uppercase tracking-wider">
                {children}
              </h4>
            ),
            ul: ({ children }) => (
              <ul className="list-disc pl-5 my-2.5 space-y-1 text-sm text-slate-200">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal pl-5 my-2.5 space-y-1 text-sm text-slate-200">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="leading-relaxed">
                {children}
              </li>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-indigo-500/70 pl-3.5 py-1 my-2.5 text-slate-300 italic bg-indigo-950/20 rounded-r-md">
                {children}
              </blockquote>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-white">
                {children}
              </strong>
            ),
            em: ({ children }) => (
              <em className="italic text-slate-200">
                {children}
              </em>
            ),
            hr: () => (
              <hr className="my-3 border-slate-700/60" />
            ),
            table: ({ children }) => (
              <div className="my-3.5 overflow-x-auto rounded-lg border border-slate-700/80 shadow-xs">
                <table className="w-full text-left text-xs border-collapse divide-y divide-slate-700/80">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-slate-900/90 text-slate-200 font-semibold">
                {children}
              </thead>
            ),
            tbody: ({ children }) => (
              <tbody className="divide-y divide-slate-800/80 bg-slate-900/40">
                {children}
              </tbody>
            ),
            tr: ({ children }) => (
              <tr className="hover:bg-slate-800/50 transition-colors">
                {children}
              </tr>
            ),
            th: ({ children }) => (
              <th className="px-3 py-2 text-slate-200 font-semibold border-r border-slate-700/60 last:border-r-0">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-3 py-2 text-slate-300 border-r border-slate-800/80 last:border-r-0">
                {children}
              </td>
            ),
            code: CodeBlock,
            a: ({ href, children, ...props }) => {
              if (href?.startsWith("#citation-")) {
                const citNum = parseInt(href.replace("#citation-", ""), 10);
                const matchedSource = citationMap.get(citNum);
                return (
                  <button
                    type="button"
                    onClick={() => (matchedSource ? handleOpenPdf(matchedSource) : null)}
                    title={
                      matchedSource
                        ? `Click to open ${matchedSource.materialName || "Document"} at Page ${matchedSource.page}`
                        : `Citation [${citNum}]`
                    }
                    className="inline-flex items-center justify-center px-1.5 py-0.2 mx-0.5 text-[10px] font-bold rounded bg-indigo-950/90 border border-indigo-500/60 text-indigo-300 hover:bg-indigo-700 hover:text-white transition-all cursor-pointer shadow-xs align-baseline"
                  >
                    {citNum}
                  </button>
                );
              }
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-indigo-400 hover:text-indigo-300 underline font-medium cursor-pointer"
                  {...props}
                >
                  <span>{children}</span>
                  <ExternalLink className="w-3 h-3 inline-block ml-0.5 opacity-70" />
                </a>
              );
            },
          }}
        >
          {prepared}
        </ReactMarkdown>
      </div>
    );
  };

  const toggleSourceExpand = (msgIndex, sourceIdx) => {
    const key = `${msgIndex}-${sourceIdx}`;
    setExpandedSources((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSendMessage = async (msgText) => {
    const textToSend = (msgText || inputMessage).trim();
    if (!textToSend || isLoading) return;

    if (readyMaterials.length === 0) {
      toast.error("Please upload and process at least one PDF before asking the AI Tutor.");
      return;
    }

    const userMessage = {
      id: Date.now().toString(),
      role: "user",
      content: textToSend,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");

    try {
      const response = await askTutor({
        projectId: project?._id,
        conversationId,
        message: textToSend,
      }).unwrap();

      if (response?.conversationId) {
        setConversationId(response.conversationId);
      }

      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response?.answer || "I processed your request, but could not produce an explanation.",
        supported: response?.supported !== false,
        sources: response?.sources || [],
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      onTutorMessage?.();
    } catch (err) {
      const errorMsg = err?.data?.message || err?.error || "Failed to reach AI Tutor. Please try again.";
      toast.error(errorMsg);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `⚠️ Error: ${errorMsg}`,
          isError: true,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSelectConversation = async (selectedId) => {
    if (selectedId === conversationId || isLoadingSpecific) return;
    try {
      const conv = await fetchConversation(selectedId).unwrap();
      if (conv) {
        setConversationId(conv._id);
        if (Array.isArray(conv.messages)) {
          setMessages(
            conv.messages.map((m, idx) => ({
              id: m._id || `${idx}`,
              role: m.role,
              content: m.content,
              supported: m.role === "assistant" ? true : undefined,
              sources: m.sources || [],
              createdAt: m.createdAt,
            }))
          );
        }
        toast.success(`Loaded "${conv.title || "Chat session"}"`);
      }
    } catch (err) {
      toast.error("Failed to load chat session");
    }
  };

  const handleResetChat = () => {
    setConversationId(null);
    setMessages([]);
    setExpandedSources({});
    toast.success("Started a new conversation session");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in pb-12">
      {/* Main Chat Thread Area */}
      <div className="lg:col-span-8 flex flex-col h-[580px] sm:h-[680px] lg:h-[740px] bg-slate-900/80 rounded-2xl border border-slate-800 shadow-xl overflow-hidden backdrop-blur-sm">
        {/* Chat Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-slate-800/80 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-white">Grounded AI Tutor</h3>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Answers verified against {readyMaterials.length} uploaded document{readyMaterials.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {conversations.length > 1 && (
              <select
                value={conversationId || ""}
                onChange={(e) => {
                  if (e.target.value) {
                    handleSelectConversation(e.target.value);
                  }
                }}
                disabled={isLoadingSpecific}
                className="bg-slate-800 border border-slate-700 text-xs text-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-[180px] truncate"
              >
                <option value="" disabled>
                  Switch Session...
                </option>
                {conversations.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.title || "Untitled Chat"} ({c.messageCount})
                  </option>
                ))}
              </select>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetChat}
              className="text-xs text-slate-400 hover:text-white"
              title="Start new conversation"
            >
              <Plus className="w-3.5 h-3.5 mr-1 text-indigo-400" />
              New Chat
            </Button>
          </div>
        </div>

        {/* Message Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {(isLoadingLatest || isLoadingSpecific) && messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 gap-3">
              <Sparkles className="w-6 h-6 animate-spin text-indigo-400" />
              <p className="text-xs">Loading previous chat session...</p>
            </div>
          ) : readyMaterials.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6">
              <EmptyState
                icon={BookOpen}
                title="No Materials Indexed Yet"
                description="Upload study materials (PDF) first so your AI Tutor can give grounded, page-cited answers."
                actionLabel="Go to Materials"
                onAction={() => onSwitchTab?.("materials")}
              />
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-8">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 shadow-inner">
                <Sparkles className="w-7 h-7 animate-pulse" />
              </div>
              <h4 className="text-base font-semibold text-white mb-2">
                Ready to explore {project?.name}
              </h4>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                Ask any question about your documents. Answers include exact page citations from your uploaded materials.
              </p>

              <div className="w-full space-y-2 text-left">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1">
                  Suggested Questions
                </div>
                {starterQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(q)}
                    className="w-full text-left p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/90 border border-slate-700/50 hover:border-indigo-500/40 text-xs text-slate-300 hover:text-indigo-200 transition-all flex items-center justify-between group"
                  >
                    <span>{q}</span>
                    <Sparkles className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, mIdx) => {
              const isUser = msg.role === "user";
              return (
                <div
                  key={msg.id || mIdx}
                  className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                >
                  {!isUser && (
                    <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 flex-shrink-0 mt-1">
                      <Sparkles className="w-4 h-4" />
                    </div>
                  )}

                  <div className={`max-w-[88%] space-y-2 ${isUser ? "text-right" : "text-left"}`}>
                    <div
                      className={`inline-block p-4 sm:p-5 rounded-2xl text-sm leading-relaxed ${
                        isUser
                          ? "bg-indigo-600 text-white rounded-tr-none shadow-md whitespace-pre-wrap"
                          : msg.isError
                          ? "bg-rose-950/40 border border-rose-800/50 text-rose-300 rounded-tl-none whitespace-pre-wrap"
                          : "bg-slate-800/90 border border-slate-700/60 text-slate-200 rounded-tl-none shadow-sm w-full"
                      }`}
                    >
                      {isUser
                        ? msg.content
                        : renderMessageContent(msg.content, msg.sources)}
                    </div>

                    {/* Grounding / Unsupported Warning */}
                    {!isUser && !msg.isError && msg.supported === false && (
                      <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-950/30 border border-amber-800/40 text-amber-300 text-xs mt-1">
                        <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-semibold">Unverified by documents:</strong> This question could not be answered strictly with high-confidence excerpts from your uploaded materials.
                        </div>
                      </div>
                    )}

                    {/* Sources / Citations List (Hierarchically grouped: Document/Heading -> Page) */}
                    {!isUser && (() => {
                      const uniqueSources = [];
                      const seenPageKeys = new Set();
                      (msg.sources || []).forEach((src) => {
                        const pageNumber = parseInt(src.page || (src.pages && src.pages[0]) || 1, 10);
                        const key = `${String(src.materialId || src.materialName || "")}_${pageNumber}`;
                        if (!seenPageKeys.has(key)) {
                          seenPageKeys.add(key);
                          uniqueSources.push(src);
                        }
                      });

                      if (uniqueSources.length === 0) return null;

                      // 1. Order displayed sources according to document hierarchy and page order (not arbitrary retrieval order)
                      const sortedSources = [...uniqueSources].sort((a, b) => {
                        const matA = a.materialName || "";
                        const matB = b.materialName || "";
                        if (matA !== matB) return matA.localeCompare(matB);
                        const pageA = parseInt(a.page || (a.pages && a.pages[0]) || 1, 10);
                        const pageB = parseInt(b.page || (b.pages && b.pages[0]) || 1, 10);
                        return pageA - pageB;
                      });

                      // 2. Group related citations under relevant main heading/subheading when possible
                      const groupedByHeading = new Map();
                      sortedSources.forEach((src) => {
                        const headingTitle = src.heading || src.chapterTitle || "Document References";
                        if (!groupedByHeading.has(headingTitle)) {
                          groupedByHeading.set(headingTitle, []);
                        }
                        groupedByHeading.get(headingTitle).push(src);
                      });

                      return (
                        <div className="pt-2 space-y-2">
                          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Grounded Page Citations ({sortedSources.length})</span>
                          </div>

                          <div className="space-y-2">
                            {Array.from(groupedByHeading.entries()).map(([heading, groupSources], gIdx) => (
                              <div
                                key={gIdx}
                                className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 text-xs text-slate-300 space-y-2"
                              >
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-300">
                                  <BookOpen className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                                  <span className="truncate">{heading}</span>
                                </div>

                                <div className="space-y-1.5 pl-2 border-l border-slate-700/80">
                                  {groupSources.map((src, sIdx) => {
                                    const origIdx = uniqueSources.indexOf(src);
                                    const isExpanded = expandedSources[`${mIdx}-${origIdx}`];
                                    const pageNumber = src.page || (src.pages && src.pages[0]) || 1;
                                    const citationNum =
                                      src.citationIndex || (src.id ? src.id.replace(/^S/i, "") : origIdx + 1);
                                    const matName = src.materialName || src.filename || "Document";

                                    return (
                                      <div key={sIdx} className="space-y-1.5">
                                        <div className="flex items-center justify-between gap-2">
                                          {/* Clickable Citation Link */}
                                          <button
                                            type="button"
                                            onClick={() => handleOpenPdf(src)}
                                            title={`Click to open ${matName} at Page ${pageNumber}`}
                                            className="flex items-center gap-2 overflow-hidden text-left group hover:text-white transition-colors flex-1 min-w-0 cursor-pointer"
                                          >
                                            <span className="w-5 h-5 rounded-md bg-indigo-950/90 border border-indigo-700/60 text-indigo-300 text-[10px] font-bold flex items-center justify-center flex-shrink-0 shadow-xs">
                                              {citationNum}
                                            </span>
                                            <FileText className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0 group-hover:text-indigo-300" />
                                            <span className="font-medium text-slate-200 truncate group-hover:text-indigo-200">
                                              {matName}
                                            </span>
                                            <Badge
                                              variant="outline"
                                              className="text-[10px] py-0 px-1.5 bg-slate-900/90 text-indigo-300 border-indigo-700/50 group-hover:border-indigo-500/70 flex-shrink-0"
                                            >
                                              Page {pageNumber}
                                            </Badge>
                                            <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-indigo-300 transition-colors flex-shrink-0" />
                                          </button>

                                          {src.sourceExcerpt && (
                                            <button
                                              type="button"
                                              onClick={() => toggleSourceExpand(mIdx, origIdx)}
                                              className="text-slate-400 hover:text-indigo-300 flex items-center gap-1 text-[11px] font-medium flex-shrink-0 ml-2 cursor-pointer"
                                              title="Toggle supporting text excerpt"
                                            >
                                              <span>Excerpt</span>
                                              {isExpanded ? (
                                                <ChevronUp className="w-3.5 h-3.5" />
                                              ) : (
                                                <ChevronDown className="w-3.5 h-3.5" />
                                              )}
                                            </button>
                                          )}
                                        </div>

                                        {isExpanded && src.sourceExcerpt && (
                                          <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-700/60 text-slate-300 font-mono text-[11px] leading-relaxed">
                                            "{src.sourceExcerpt}"
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {isUser && (
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white flex-shrink-0 mt-1 shadow-md">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })
          )}

          {isLoading && (
            <div className="flex gap-3 justify-start items-center">
              <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 flex-shrink-0">
                <Sparkles className="w-4 h-4 animate-spin text-indigo-400" />
              </div>
              <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl rounded-tl-none p-4 text-xs text-slate-300 flex items-center gap-2 shadow-sm">
                <span className="flex space-x-1">
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></span>
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                </span>
                <span>Searching documents & generating verified explanation...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/95">
          <div className="flex items-center gap-2">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading || readyMaterials.length === 0}
              placeholder={
                readyMaterials.length === 0
                  ? "Upload materials first to enable the tutor..."
                  : "Ask anything about your uploaded study materials... (Enter to send)"
              }
              rows={1}
              className="flex-1 resize-none bg-slate-800/70 border border-slate-700/70 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all disabled:opacity-50"
            />
            <Button
              variant="primary"
              onClick={() => handleSendMessage()}
              disabled={isLoading || !inputMessage.trim() || readyMaterials.length === 0}
              className="h-11 px-4 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 px-1">
            <span>Powered by Groq LLaMA 3.3 + Voyage AI Embeddings</span>
            <span className="hidden sm:inline">Press Shift + Enter for new line</span>
          </div>
        </div>
      </div>

      {/* Right Learning Context Sidebar */}
      <div className="lg:col-span-4 space-y-5">
        {/* Grounded Tutor Info Card */}
        <div className="bg-slate-900/80 rounded-2xl border border-indigo-500/20 p-5 shadow-lg backdrop-blur-sm">
          <div className="flex items-center gap-2 text-indigo-400 mb-3">
            <ShieldCheck className="w-5 h-5" />
            <h4 className="text-sm font-semibold text-white">Grounded Pedagogical Tutoring</h4>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed mb-4">
            Unlike general-purpose chat bots, this tutor answers strictly from your project documents and provides exact page citations to prevent hallucination.
          </p>

          <div className="space-y-3 pt-3 border-t border-slate-800">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Current Space:</span>
              <span className="text-slate-200 font-medium truncate max-w-[150px]">
                {space?.name || "General"}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Target Project:</span>
              <span className="text-slate-200 font-medium truncate max-w-[150px]">
                {project?.name}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Indexed Materials:</span>
              <Badge variant="outline" className="text-xs bg-indigo-950/40 text-indigo-300 border-indigo-700/40">
                {readyMaterials.length} PDF{readyMaterials.length === 1 ? "" : "s"}
              </Badge>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Assessed Concepts:</span>
              <span className="text-slate-200 font-medium">
                {growth?.summary?.assessedConcepts || 0} / {growth?.summary?.totalConcepts || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Previous Chat Sessions */}
        {conversations.length > 0 && (
          <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-lg backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                <span>Chat History ({conversations.length})</span>
              </h4>
              <button
                onClick={handleResetChat}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
                title="Start a new chat session"
              >
                <Plus className="w-3 h-3" />
                <span>New</span>
              </button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {conversations.map((conv) => {
                const isActive = conv._id === conversationId;
                return (
                  <button
                    key={conv._id}
                    onClick={() => handleSelectConversation(conv._id)}
                    disabled={isLoadingSpecific}
                    className={`w-full text-left p-2.5 rounded-xl border text-xs transition-all flex items-center justify-between ${
                      isActive
                        ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-200 shadow-sm"
                        : "bg-slate-800/40 border-slate-700/50 text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <MessageSquare
                        className={`w-3.5 h-3.5 flex-shrink-0 ${
                          isActive ? "text-indigo-400" : "text-slate-500"
                        }`}
                      />
                      <span className="truncate font-medium">
                        {conv.title || "Untitled Chat"}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 flex-shrink-0 ml-2">
                      {conv.messageCount} msg{conv.messageCount === 1 ? "" : "s"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Indexed Materials Quick-List */}
        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-lg backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
              Source Documents ({readyMaterials.length})
            </h4>
            <button
              onClick={() => onSwitchTab?.("materials")}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
            >
              Manage
            </button>
          </div>

          {readyMaterials.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-2">
              No ready materials. Go to Materials tab to upload.
            </p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {readyMaterials.map((mat) => (
                <div
                  key={mat._id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/50 text-xs"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FileText className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                    <span className="text-slate-300 truncate font-medium">
                      {mat.title || mat.originalName}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 flex-shrink-0 ml-2">
                    {mat.totalPages || 1}p
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Learning Mastery Indicator */}
        <div className="bg-gradient-to-br from-indigo-950/40 to-slate-900/80 rounded-2xl border border-slate-800 p-5 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300">Project Mastery</span>
            <span className="text-xs font-bold text-indigo-400">
              {growth?.summary?.averageMastery || 0}%
            </span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-3">
            <div
              className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full transition-all duration-500"
              style={{ width: `${growth?.summary?.averageMastery || 0}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Asking targeted questions in this tutor helps reinforce conceptual understanding and boosts retention for upcoming quizzes.
          </p>
        </div>
      </div>
    </div>
  );
};
