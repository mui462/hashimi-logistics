import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Check, Copy, MessageCircle, Minus, RotateCcw, Send, Sparkles, SquarePen, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PATHS } from '../../config/paths';
import { getChatStatus } from '../../services/chatService';
import { cx } from '../../utils/cx';
import { MAX_INPUT_LENGTH, SUGGESTED_QUESTIONS, useChat } from './useChat';

const TITLE = 'Hashimi AI Assistant';
const time = (value) => value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const isSmallScreen = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches;

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers and non-secure pages: fall back to a temporary text field.
    try {
      const field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      const done = document.execCommand('copy');
      field.remove();
      return done;
    } catch {
      return false;
    }
  }
}

// The answer is written by a model on the company's own machine, which can take a while: after a few seconds say so.
const SLOW_AFTER_MS = 8000;

function TypingIndicator() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="flex items-start gap-2" role="status">
      <span className="sr-only">{TITLE} is typing{slow ? '. Still working on your answer.' : ''}</span>
      <div className="flex items-center gap-2 rounded-2xl rounded-tl-md border border-steel-200 bg-white px-4 py-3" aria-hidden="true">
        <span className="flex items-center gap-1.5">
          {[0, 150, 300].map((delay) => (
            <span key={delay} className="size-2 animate-bounce rounded-full bg-signal-500 motion-reduce:animate-none" style={{ animationDelay: `${delay}ms` }} />
          ))}
        </span>
        {slow && <span className="text-xs text-steel-600">Still working on your answer…</span>}
      </div>
    </div>
  );
}

function AssistantMessage({ message, onNavigate }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    if (await copyText(message.content)) {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <li className="flex max-w-[92%] flex-col items-start gap-1.5 self-start">
      <div className="rounded-2xl rounded-tl-md border border-steel-200 bg-white px-4 py-3 text-[0.95rem] leading-relaxed text-ink-900 shadow-sm">
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </div>
      {message.links?.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Related pages">
          {message.links.map((link) => (
            <li key={link.path}>
              <Link to={link.path} onClick={onNavigate} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-signal-400 bg-signal-400/10 px-3 text-sm font-semibold text-ink-900 transition-colors hover:bg-signal-400">
                {link.label}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-3 px-1 text-xs text-steel-500">
        <time dateTime={message.time.toISOString()}>{time(message.time)}</time>
        {!message.welcome && (
          <button type="button" onClick={copy} aria-label={copied ? 'Response copied' : 'Copy response'} className="inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 font-semibold text-steel-600 hover:bg-steel-100 hover:text-ink-900">
            {copied ? <Check className="size-3.5 text-success-700" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
    </li>
  );
}

function UserMessage({ message }) {
  return (
    <li className="flex max-w-[88%] flex-col items-end gap-1 self-end">
      <div className="rounded-2xl rounded-tr-md bg-gradient-to-br from-signal-400 to-signal-500 px-4 py-3 text-[0.95rem] leading-relaxed text-ink-950 shadow-sm">
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </div>
      <time className="px-1 text-xs text-steel-500" dateTime={message.time.toISOString()}>{time(message.time)}</time>
    </li>
  );
}

/**
 * The floating "Hashimi AI Assistant". Three states: closed (a round button at the bottom right), open (the chat window) and
 * minimized (a slim bar that keeps the conversation). It never opens by itself and sits in a corner of the page.
 */
export default function ChatWidget() {
  const [mode, setMode] = useState('closed');
  const [draft, setDraft] = useState('');
  const [available, setAvailable] = useState(null);
  const [unread, setUnread] = useState(false);
  const [hiddenForForm, setHiddenForForm] = useState(false);
  const { messages, busy, error, send, retry, reset } = useChat();
  const root = useRef(null);
  const fab = useRef(null);
  const input = useRef(null);
  const end = useRef(null);
  const statusChecked = useRef(false);
  const inputId = useId();
  const answers = messages.filter((message) => message.role === 'assistant' && !message.welcome).length;
  const lastAnswers = useRef(answers);

  // Ask once, the first time the window opens, whether the assistant is switched on.
  useEffect(() => {
    if (mode !== 'open' || statusChecked.current) return;
    statusChecked.current = true;
    getChatStatus().then(setAvailable).catch(() => setAvailable(null));
  }, [mode]);

  useEffect(() => {
    if (mode === 'open') {
      setUnread(false);
      const frame = requestAnimationFrame(() => input.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [mode]);

  // A new answer that arrives while the bar is minimized is flagged.
  useEffect(() => {
    if (answers > lastAnswers.current && mode === 'minimized') setUnread(true);
    lastAnswers.current = answers;
  }, [answers, mode]);

  useEffect(() => {
    // Follow the conversation as it grows; the first view (just the greeting) starts at the top so none of it is cut off.
    if (messages.length === 1 && !busy && !error) return;
    end.current?.scrollIntoView?.({ block: 'end', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [messages, busy, error, mode]);

  // On a phone the round button steps aside while the visitor types into a form field elsewhere on the page.
  useEffect(() => {
    const isField = (node) => typeof node?.matches === 'function' && node.matches('input, textarea, select, [contenteditable="true"]') && !root.current?.contains(node);
    const onIn = (event) => isField(event.target) && isSmallScreen() && setHiddenForForm(true);
    const onOut = () => setHiddenForForm(false);
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
    };
  }, []);

  // A click or tap anywhere outside the open window closes it. The conversation is kept, and focus is left alone so the visitor lands
  // on whatever they clicked (a link, a form field). Clicks inside the window, and on the minimized bar, do nothing here.
  useEffect(() => {
    if (mode !== 'open') return undefined;
    const onPointerDown = (event) => {
      if (root.current && !root.current.contains(event.target)) setMode('closed');
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [mode]);

  const close = useCallback(() => {
    setMode('closed');
    requestAnimationFrame(() => fab.current?.focus());
  }, []);
  const unavailable = available === false;

  const submit = async (event) => {
    event?.preventDefault();
    const value = draft.trim();
    if (!value || busy || unavailable) return;
    setDraft('');
    await send(value);
  };

  const onKeyDown = (event) => {
    // Enter sends, Shift+Enter makes a new line; Enter while composing text (IME) is left alone.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent?.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const ask = (question) => {
    if (!busy && !unavailable) send(question);
  };

  const showSuggestions = messages.length === 1 && !busy;

  return (
    <div ref={root} onKeyDown={(event) => event.key === 'Escape' && mode !== 'closed' && close()}>
      {mode === 'closed' && (
        <button
          ref={fab}
          type="button"
          onClick={() => setMode('open')}
          aria-label={`Open chat: ${TITLE}`}
          className={cx(
            'fixed bottom-4 right-4 z-40 flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-signal-400 to-signal-500 text-ink-950 shadow-[0_12px_32px_-8px_rgb(0_0_0/0.55)] ring-1 ring-black/10 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-8px_rgb(0_0_0/0.6)] motion-reduce:transition-none sm:bottom-6 sm:right-6 sm:size-16',
            hiddenForForm && 'pointer-events-none translate-y-4 opacity-0'
          )}
          tabIndex={hiddenForForm ? -1 : 0}
          aria-hidden={hiddenForForm || undefined}
        >
          <MessageCircle className="size-7 sm:size-8" aria-hidden="true" />
          {unread && <span className="absolute right-1 top-1 size-3 rounded-full border-2 border-white bg-danger-700" aria-hidden="true" />}
        </button>
      )}

      {mode === 'minimized' && (
        <div role="region" aria-label={`${TITLE} (minimized)`} className="fixed bottom-4 right-4 z-40 flex items-center gap-1 rounded-full bg-ink-950 p-1.5 pl-4 text-white shadow-[0_12px_32px_-8px_rgb(0_0_0/0.6)] ring-1 ring-white/15 sm:bottom-6 sm:right-6">
          <button type="button" onClick={() => setMode('open')} aria-label={`Restore chat: ${TITLE}${unread ? ', new reply' : ''}`} className="flex min-h-10 items-center gap-2 pr-2 text-sm font-bold">
            <Sparkles className="size-4 text-signal-400" aria-hidden="true" />
            {TITLE}
            {unread && <span className="size-2.5 rounded-full bg-signal-400" aria-hidden="true" />}
          </button>
          <button type="button" onClick={close} aria-label="Close chat" className="flex size-10 items-center justify-center rounded-full hover:bg-white/10">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {mode === 'open' && (
        <section
          role="dialog"
          aria-label={TITLE}
          className="fixed inset-x-3 bottom-3 z-40 flex h-[min(38rem,calc(100svh-104px))] flex-col overflow-hidden rounded-3xl border border-signal-400/40 bg-steel-50 shadow-[0_28px_70px_-20px_rgb(0_0_0/0.65)] sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[min(38rem,calc(100svh-112px))] sm:w-[26rem] xl:h-[min(38rem,calc(100svh-176px))]"
        >
          <header data-surface="dark" className="relative flex items-center gap-3 bg-ink-950 px-4 py-3 text-white">
            <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-signal-400 to-signal-500 text-ink-950 min-[400px]:flex">
              <Sparkles className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-extrabold leading-tight">{TITLE}</h2>
              <p className="truncate text-xs text-steel-300">Hashimi Logistics Inc. · AI-powered</p>
            </div>
            <button type="button" onClick={reset} aria-label="Start a new conversation" title="New conversation" className="flex size-9 items-center justify-center rounded-full hover:bg-white/10">
              <SquarePen className="size-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setMode('minimized')} aria-label="Minimize chat" title="Minimize" className="flex size-9 items-center justify-center rounded-full hover:bg-white/10">
              <Minus className="size-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={close} aria-label="Close chat" title="Close" className="flex size-9 items-center justify-center rounded-full hover:bg-white/10">
              <X className="size-4" aria-hidden="true" />
            </button>
            <span className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-signal-400 to-transparent" aria-hidden="true" />
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
            <ol role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions" className="flex flex-col gap-3">
              {messages.map((message) => (message.role === 'user' ? <UserMessage key={message.id} message={message} /> : <AssistantMessage key={message.id} message={message} onNavigate={() => isSmallScreen() && setMode('minimized')} />))}
              {busy && <li><TypingIndicator /></li>}
            </ol>

            {showSuggestions && !unavailable && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-steel-600">Try asking</p>
                <ul className="flex flex-wrap gap-2" aria-label="Suggested questions">
                  {SUGGESTED_QUESTIONS.map((question) => (
                    <li key={question}>
                      <button type="button" onClick={() => ask(question)} className="min-h-10 rounded-full border border-signal-400/60 bg-white px-3.5 py-1.5 text-left text-sm font-semibold text-ink-900 transition-colors hover:border-signal-500 hover:bg-signal-400/15">
                        {question}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {unavailable && (
              <div role="alert" className="mt-4 rounded-2xl border border-signal-400/50 bg-white p-4 text-sm">
                <p className="font-bold">The AI assistant is not available right now.</p>
                <p className="mt-1 text-steel-600">Our team can help directly.</p>
                <Link to={PATHS.contact} onClick={() => isSmallScreen() && setMode('minimized')} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-ink-900 px-4 text-sm font-bold text-white hover:bg-ink-800">
                  Contact us
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            )}

            {error && !busy && (
              <div role="alert" className="mt-4 rounded-2xl border-l-4 border-danger-700 bg-danger-50 p-4 text-sm text-danger-700">
                <p className="font-semibold">{error.message}</p>
                <button type="button" onClick={retry} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-danger-700 bg-white px-4 font-bold hover:bg-danger-700 hover:text-white">
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Try again
                </button>
              </div>
            )}
            <div ref={end} />
          </div>

          <form onSubmit={submit} className="border-t border-steel-200 bg-white p-3" aria-label="Send a message">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label htmlFor={inputId} className="sr-only">Your message</label>
                <textarea
                  id={inputId}
                  ref={input}
                  rows={1}
                  value={draft}
                  maxLength={MAX_INPUT_LENGTH}
                  disabled={unavailable}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={unavailable ? 'The assistant is unavailable' : 'Type your question…'}
                  className="block max-h-28 min-h-11 w-full resize-none rounded-2xl border border-steel-300 bg-white px-4 py-2.5 text-base text-ink-900 placeholder:text-steel-500 focus:border-signal-500 disabled:bg-steel-100"
                  style={{ fieldSizing: 'content' }}
                />
              </div>
              <button type="submit" disabled={!draft.trim() || busy || unavailable} aria-label="Send message" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink-900 text-signal-400 transition-colors hover:bg-signal-400 hover:text-ink-950 disabled:cursor-not-allowed disabled:bg-steel-200 disabled:text-steel-500">
                <Send className="size-5" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-2 px-1 text-xs leading-snug text-steel-600">
              AI answers may be incomplete. Don’t share passwords, payment or other sensitive details. {draft.length > MAX_INPUT_LENGTH - 150 && <span className="font-semibold">{MAX_INPUT_LENGTH - draft.length} characters left.</span>}
            </p>
          </form>
        </section>
      )}
    </div>
  );
}
