import { useEffect, useRef, useState } from 'preact/hooks';
import { getNotes, getTodos, onKeyChange, saveNotes, saveTodos, uid } from '../lib/settings';
import type { Todo } from '../lib/types';

export function TodoPanel() {
  const [todos, setTodos] = useState<Todo[]>([]);
  useEffect(() => {
    void getTodos().then(setTodos);
    return onKeyChange<Todo[]>('todos', setTodos);
  }, []);
  const update = (t: Todo[]) => {
    setTodos(t);
    void saveTodos(t);
  };
  const left = todos.filter((t) => !t.done).length;

  return (
    <div class="todo">
      <form
        class="todo-add"
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem('text') as HTMLInputElement;
          const text = input.value.trim();
          if (text) update([...todos, { id: uid(), text, done: false }]);
          input.value = '';
        }}
      >
        <input name="text" placeholder="新增待辦,Enter 送出" aria-label="新增待辦" autoComplete="off" />
      </form>
      <ul class="todo-list">
        {todos.map((t) => (
          <li key={t.id} class={t.done ? 'is-done' : ''}>
            <label>
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => update(todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))}
              />
              <span>{t.text}</span>
            </label>
            <button type="button" class="icon-btn" aria-label={`刪除 ${t.text}`} onClick={() => update(todos.filter((x) => x.id !== t.id))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <div class="panel-foot">
        <span>剩 {left} 項</span>
        {todos.some((t) => t.done) && (
          <button type="button" class="text-btn" onClick={() => update(todos.filter((t) => !t.done))}>
            清除已完成
          </button>
        )}
      </div>
    </div>
  );
}

export function NotesPanel() {
  const [text, setText] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    void getNotes().then(setText);
  }, []);
  return (
    <textarea
      class="notes"
      value={text}
      placeholder="隨手記下點什麼…"
      aria-label="便條"
      onInput={(e) => {
        const v = (e.target as HTMLTextAreaElement).value;
        setText(v);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => void saveNotes(v), 500);
      }}
    />
  );
}
