/**
 * The "Hashimi AI Assistant" widget, rendered in jsdom against a mocked /chatbot API (the mocks live only in this file).
 * Covers opening and closing, the welcome message and suggested questions, answers with page links, follow-up context, loading and
 * error states with retry, the unavailable state, keyboard use, minimize/restore, new conversation, copy, text-only rendering,
 * and static guarantees (no secrets, no browser storage, no HTML injection).
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { createHarness, ROOT, act } from './cms-harness.mjs';

const WELCOME = "Hello! Welcome to Hashimi Logistics LLC I'm your AI assistant. I can help you understand our freight services, request a quote, explore carrier opportunities, and find answers to common logistics questions. How can I help you today?";
const SUGGESTIONS = ['I need a freight quote.', 'How can I become a carrier?', 'What freight services do you offer?', 'What areas do you serve?', 'How can I track my shipment?'];
const answer = (reply, links = []) => ({ data: { reply, links } });

describe('Hashimi AI Assistant widget', () => {
  let h;
  before(async () => { h = await createHarness(); });
  after(async () => { await h.close(); });

  const status = (available = true) => () => ({ data: { available } });
  const open = async (routes = {}, path = '/') => {
    const view = await h.visit(path, { as: null, routes: { 'GET /chatbot/status': status(), ...routes } });
    await h.click(h.button('Open chat: Hashimi AI Assistant'));
    return view;
  };
  const dialog = () => document.querySelector('[role="dialog"][aria-label="Hashimi AI Assistant"]');
  const log = () => dialog()?.querySelector('[role="log"]');
  const type = (text) => h.fill({ 'Your message': text });
  const sent = () => h.called('POST /chatbot/messages');
  const send = async (text) => { await type(text); await h.click(h.button('Send message')); await h.tick(80); };

  describe('opening', () => {
    test('a round button sits on every public page and opens the chat; nothing is requested until then', async () => {
      const view = await h.visit('/services', { as: null, routes: {} });
      await h.tick(300); // the assistant is loaded after the page
      assert.ok(h.button('Open chat: Hashimi AI Assistant'));
      assert.equal(dialog(), null);
      assert.equal(h.called('GET /chatbot/status').length, 0);
      assert.equal(h.called('POST /chatbot/messages').length, 0);
      await view.unmount();
    });

    test('it does not appear on the sign-in or admin pages', async () => {
      for (const path of ['/login', '/admin/login']) {
        const view = await h.visit(path, { as: null, routes: {} });
        assert.equal(h.button('Open chat: Hashimi AI Assistant'), undefined, path);
        await view.unmount();
      }
    });

    test('the window shows the welcome message and the five suggested questions, and asks the server once whether it is available', async () => {
      const view = await open();
      assert.ok(dialog());
      assert.match(dialog().textContent, /Hashimi AI Assistant/);
      assert.equal(log().querySelector('li p').textContent, WELCOME);
      const chips = [...dialog().querySelectorAll('[aria-label="Suggested questions"] button')].map((b) => b.textContent);
      assert.deepEqual(chips, SUGGESTIONS);
      assert.equal(h.called('GET /chatbot/status').length, 1);
      assert.equal(document.activeElement.tagName, 'TEXTAREA', 'the message box has focus');
      await h.click(h.button('Minimize chat'));
      await h.click(h.button('Restore chat: Hashimi AI Assistant'));
      assert.equal(h.called('GET /chatbot/status').length, 1, 'not asked again');
      await view.unmount();
    });
  });

  describe('conversation', () => {
    test('a suggested question is sent and answered, with the pages the answer mentions as links', async () => {
      const view = await open({ 'POST /chatbot/messages': () => answer('Use the Request a Quote page: /request-quote.', [{ label: 'Request a Quote', path: '/request-quote' }]) });
      await h.click(h.button('I need a freight quote.'));
      assert.deepEqual(sent()[0].body, { messages: [{ role: 'user', content: 'I need a freight quote.' }] });
      assert.match(log().textContent, /I need a freight quote\./);
      assert.match(log().textContent, /Use the Request a Quote page/);
      assert.equal(dialog().querySelector('[aria-label="Suggested questions"]'), null, 'suggestions go away once the chat starts');
      const link = [...dialog().querySelectorAll('a')].find((a) => a.textContent.trim() === 'Request a Quote');
      assert.equal(link.getAttribute('href'), '/request-quote');
      await h.click(link);
      // The quote page is loaded on demand, which can take a moment when the machine is busy.
      for (let attempt = 0; attempt < 40 && view.path() !== '/request-quote'; attempt += 1) await h.tick(100);
      assert.equal(view.path(), '/request-quote');
      await view.unmount();
    });

    test('Enter sends, Shift+Enter does not, and empty or blank messages are never sent', async () => {
      const view = await open({ 'POST /chatbot/messages': () => answer('Hello!') });
      assert.equal(h.button('Send message').disabled, true, 'nothing typed: send is disabled');
      await type('   ');
      assert.equal(h.button('Send message').disabled, true, 'blank: still disabled');
      const box = h.labelled('Your message');
      await act(async () => box.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
      await h.tick(60);
      assert.equal(sent().length, 0, 'Enter on a blank box sends nothing');
      await type('What do you haul?');
      await act(async () => box.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true })));
      await h.tick(60);
      assert.equal(sent().length, 0, 'Shift+Enter makes a new line');
      await act(async () => box.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
      await h.tick(80);
      assert.equal(sent().length, 1);
      assert.equal(sent()[0].body.messages[0].content, 'What do you haul?');
      assert.equal(h.labelled('Your message').value, '', 'the box is cleared');
      await view.unmount();
    });

    test('a slow answer shows a gentle "still working" note after a few seconds', async () => {
      h.state.delayMs = 9500;
      const view = await open({ 'POST /chatbot/messages': () => answer('Finally.') });
      await type('A slow one');
      await act(async () => h.button('Send message').click());
      assert.doesNotMatch(dialog().textContent, /Still working/);
      await h.tick(8400);
      assert.match(dialog().textContent, /Still working on your answer/);
      await h.tick(1800);
      assert.match(log().textContent, /Finally\./);
      h.state.delayMs = 0;
      await view.unmount();
    });

    test('while an answer is pending there is a typing indicator and a second send is ignored', async () => {
      h.state.delayMs = 250;
      const view = await open({ 'POST /chatbot/messages': () => answer('Done.') });
      await type('First question');
      await act(async () => { h.button('Send message').click(); h.button('Send message').click(); });
      assert.match(dialog().textContent, /Hashimi AI Assistant is typing/);
      assert.equal(h.button('Send message').disabled, true);
      await h.tick(400);
      assert.equal(sent().length, 1, 'one request despite two clicks');
      assert.doesNotMatch(dialog().textContent, /is typing/);
      assert.match(log().textContent, /Done\./);
      h.state.delayMs = 0;
      await view.unmount();
    });

    test('follow-up questions send the earlier turns (but not the greeting), starting with a visitor message', async () => {
      let n = 0;
      const view = await open({ 'POST /chatbot/messages': () => answer(`Answer ${(n += 1)}`) });
      await send('How do I become a carrier?');
      await send('And what documents are needed?');
      assert.deepEqual(sent()[1].body.messages, [
        { role: 'user', content: 'How do I become a carrier?' },
        { role: 'assistant', content: 'Answer 1' },
        { role: 'user', content: 'And what documents are needed?' },
      ]);
      await view.unmount();
    });

    test('long chats keep only the most recent turns, still starting with the visitor', async () => {
      let n = 0;
      const view = await open({ 'POST /chatbot/messages': () => answer(`A${(n += 1)}`) });
      for (let i = 1; i <= 6; i += 1) await send(`Q${i}`);
      const last = sent().at(-1).body.messages;
      assert.ok(last.length <= 8);
      assert.equal(last[0].role, 'user');
      assert.equal(last.at(-1).content, 'Q6');
      await view.unmount();
    });

    test('replies are shown as plain text: HTML in an answer is never turned into elements', async () => {
      const view = await open({ 'POST /chatbot/messages': () => answer('<img src=x onerror="window.pwned=1"><b>bold</b> <script>window.pwned=2</script>') });
      await send('hello');
      assert.equal(log().querySelector('img, b, script'), null);
      assert.match(log().textContent, /<img src=x/);
      assert.equal(window.pwned, undefined);
      await view.unmount();
    });
  });

  describe('failures', () => {
    test('a server error shows its message with Try again, which re-sends without duplicating the question', async () => {
      let attempts = 0;
      const view = await open({ 'POST /chatbot/messages': () => (++attempts === 1 ? { status: 503, body: { message: 'The AI assistant is busy right now. Please try again in a moment.', code: 'CHATBOT_BUSY' } } : answer('Back again.')) });
      await send('Hello?');
      const alert = [...dialog().querySelectorAll('[role="alert"]')].at(-1);
      assert.match(alert.textContent, /busy right now/);
      await h.click(h.button('Try again'));
      assert.equal(sent().length, 2);
      assert.deepEqual(sent()[1].body, sent()[0].body, 'the same question');
      assert.match(log().textContent, /Back again\./);
      assert.equal([...log().querySelectorAll('li')].filter((li) => li.textContent.includes('Hello?')).length, 1, 'the question is on screen once');
      assert.equal(dialog().querySelector('[role="alert"]'), null);
      await view.unmount();
    });

    test('a network failure is explained plainly and can be retried', async () => {
      let attempts = 0;
      const view = await open({ 'POST /chatbot/messages': () => (++attempts === 1 ? { networkError: true } : answer('Connected.')) });
      await send('Anyone there?');
      assert.match(dialog().textContent, /could not reach the server/i);
      await h.click(h.button('Try again'));
      assert.match(log().textContent, /Connected\./);
      await view.unmount();
    });

    test('rate limiting and over-long input surface the server\'s message', async () => {
      const view = await open({ 'POST /chatbot/messages': () => ({ status: 429, body: { message: 'You are sending messages very quickly. Please wait a few minutes and try again.' } }) });
      await send('again');
      assert.match(dialog().textContent, /Please wait a few minutes/);
      await view.unmount();
    });

    test('when the server says the assistant is unavailable, the chat says so honestly: no input, no pretend answers, a way to contact the team', async () => {
      const view = await open({ 'GET /chatbot/status': status(false) });
      assert.match(dialog().textContent, /not available right now/);
      assert.equal(h.labelled('Your message').disabled, true);
      assert.equal(h.button('Send message').disabled, true);
      assert.equal(dialog().querySelector('[aria-label="Suggested questions"]'), null);
      assert.equal([...dialog().querySelectorAll('a')].find((a) => a.textContent.includes('Contact us')).getAttribute('href'), '/contact');
      assert.equal(sent().length, 0);
      await view.unmount();
    });

    test('if the status check itself fails the chat still opens and the first message shows the real error', async () => {
      const view = await open({ 'GET /chatbot/status': () => ({ networkError: true }), 'POST /chatbot/messages': () => ({ status: 503, body: { message: 'The AI assistant is not available right now. Please use the Contact page to reach our team.' } }) });
      assert.equal(h.labelled('Your message').disabled, false);
      await send('hi');
      assert.match(dialog().textContent, /not available right now/);
      await view.unmount();
    });
  });

  describe('window controls', () => {
    test('minimize keeps the conversation, restore brings it back, close then reopen keeps it too', async () => {
      const view = await open({ 'POST /chatbot/messages': () => answer('Kept.') });
      await send('Remember me');
      await h.click(h.button('Minimize chat'));
      assert.equal(dialog(), null);
      assert.ok(document.querySelector('[role="region"][aria-label="Hashimi AI Assistant (minimized)"]'));
      await h.click(h.button('Restore chat: Hashimi AI Assistant'));
      assert.match(log().textContent, /Remember me/);
      await h.click(h.button('Close chat'));
      assert.equal(dialog(), null);
      assert.equal(document.activeElement, h.button('Open chat: Hashimi AI Assistant'), 'focus returns to the round button');
      await h.click(h.button('Open chat: Hashimi AI Assistant'));
      assert.match(log().textContent, /Remember me/);
      await view.unmount();
    });

    test('a click or tap anywhere outside the chat window closes it, keeps the conversation, and leaves clicks inside alone', async () => {
      const view = await open({ 'POST /chatbot/messages': () => answer('Still here.') });
      await send('Remember this');
      const down = (target) => act(async () => target.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true })));
      await down(log());
      await down(h.labelled('Your message'));
      await down(dialog().querySelector('header'));
      assert.ok(dialog(), 'pointer presses inside the window do not close it');
      await down(document.querySelector('main#main-content'));
      assert.equal(dialog(), null, 'a press on the page behind closes it');
      assert.ok(h.button('Open chat: Hashimi AI Assistant'));
      await h.click(h.button('Open chat: Hashimi AI Assistant'));
      assert.match(log().textContent, /Remember this/, 'the conversation is kept');
      await down(document.querySelector('nav[aria-label="Primary"] a, header a'));
      assert.equal(dialog(), null, 'a press on the navbar closes it too');
      await view.unmount();
    });

    test('a click outside does not close the minimized bar, and focus is not pulled away from what the visitor clicked', async () => {
      const view = await open();
      await h.click(h.button('Minimize chat'));
      await act(async () => document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true })));
      assert.ok(document.querySelector('[role="region"][aria-label="Hashimi AI Assistant (minimized)"]'), 'the minimized bar stays');
      await h.click(h.button('Restore chat: Hashimi AI Assistant'));
      const link = [...document.querySelectorAll('footer a')][0];
      link.focus();
      await act(async () => link.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true })));
      await h.tick(80);
      assert.equal(dialog(), null);
      assert.equal(document.activeElement, link, 'focus stays on the page element that was clicked');
      await view.unmount();
    });

    test('Escape closes the chat', async () => {
      const view = await open();
      await h.press('Escape', h.labelled('Your message'));
      assert.equal(dialog(), null);
      await view.unmount();
    });

    test('a new conversation clears the chat back to the welcome message and suggestions, and ignores a late answer', async () => {
      h.state.delayMs = 200;
      const view = await open({ 'POST /chatbot/messages': () => answer('Late answer') });
      await type('Slow one');
      await act(async () => h.button('Send message').click());
      await h.click(h.button('Start a new conversation'));
      await h.tick(400);
      assert.equal(log().querySelectorAll('li p').length, 1);
      assert.equal(log().querySelector('li p').textContent, WELCOME);
      assert.doesNotMatch(dialog().textContent, /Late answer|Slow one/);
      assert.ok(dialog().querySelector('[aria-label="Suggested questions"]'));
      h.state.delayMs = 0;
      await h.click(h.button('I need a freight quote.'));
      assert.equal(sent().at(-1).body.messages.length, 1, 'the old conversation is not sent');
      await view.unmount();
    });

    test('a response can be copied', async () => {
      let copied = null;
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text) => { copied = text; } }, configurable: true });
      const view = await open({ 'POST /chatbot/messages': () => answer('Copy this answer.') });
      await send('hello');
      await h.click(h.button('Copy response'));
      assert.equal(copied, 'Copy this answer.');
      assert.ok(h.button('Response copied'));
      await view.unmount();
    });

    test('messages carry readable times and the conversation is an announced live log', async () => {
      const view = await open({ 'POST /chatbot/messages': () => answer('Hi.') });
      await send('hello');
      assert.ok(log().querySelectorAll('time[datetime]').length >= 3);
      assert.equal(log().getAttribute('aria-live'), 'polite');
      await view.unmount();
    });
  });

  describe('static guarantees', () => {
    const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
    const source = (dir) => files(path.join(ROOT, dir)).map((file) => [file, readFileSync(file, 'utf8')]);

    test('the browser never talks to the AI engine: no Ollama address, model name or key is anywhere in the frontend source', () => {
      for (const [file, text] of source('src')) {
        assert.ok(!/ollama|11434|OLLAMA_|qwen|ANTHROPIC|sk-ant|x-api-key/i.test(text), file);
      }
    });

    test('the only chat endpoints the browser uses are the website\'s own /chatbot API', () => {
      const text = readFileSync(path.join(ROOT, 'src/services/chatService.js'), 'utf8');
      assert.deepEqual([...text.matchAll(/apiClient\.(?:get|post)\('([^']+)'/g)].map((match) => match[1]).sort(), ['/chatbot/messages', '/chatbot/status']);
    });

    test('the chat never writes to browser storage and never injects HTML', () => {
      for (const [file, text] of [...source('src/components/chatbot'), ...source('src/services').filter(([f]) => f.endsWith('chatService.js'))]) {
        assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(text), `${file} uses browser storage`);
        assert.ok(!/dangerouslySetInnerHTML|innerHTML|insertAdjacentHTML/.test(text), `${file} injects HTML`);
      }
    });
  });
});
