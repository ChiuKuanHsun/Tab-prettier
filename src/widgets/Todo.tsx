import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
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
        <input name="text" placeholder={t('widgets.todo.placeholder')} aria-label={t('widgets.todo.add')} autoComplete="off" />
      </form>
      <ul class="todo-list">
        {todos.map((item) => (
          <li key={item.id} class={item.done ? 'is-done' : ''}>
            <label>
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => update(todos.map((x) => (x.id === item.id ? { ...x, done: !x.done } : x)))}
              />
              <span>{item.text}</span>
            </label>
            <button type="button" class="icon-btn" aria-label={t('common.deleteItem', { name: item.text })} onClick={() => update(todos.filter((x) => x.id !== item.id))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <div class="panel-foot">
        <span>{t('widgets.todo.left', { n: left })}</span>
        {todos.some((t) => t.done) && (
          <button type="button" class="text-btn" onClick={() => update(todos.filter((t) => !t.done))}>
            {t('widgets.todo.clearDone')}
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
      placeholder={t('widgets.todo.notesPlaceholder')}
      aria-label={t('widgets.todo.notes')}
      onInput={(e) => {
        const v = (e.target as HTMLTextAreaElement).value;
        setText(v);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => void saveNotes(v), 500);
      }}
    />
  );
}
