const qs = (s, root=document) => root.querySelector(s);
const qsa = (s, root=document) => [...root.querySelectorAll(s)];

// Состояние в Renderer
let state = {
  tasks: [],
  selectedId: null
};

// Инициализация
window.addEventListener('DOMContentLoaded', async () => {
  const data = await window.api.loadTasks();
  state.tasks = data.tasks || [];
  renderMainList();
  bindUI();
});

function bindUI(){
  qs('#addMainBtn').addEventListener('click', onAddMain);
  qs('#addSubBtn').addEventListener('click', onAddSub);
  qs('#deleteMainBtn').addEventListener('click', onDeleteMain);
  qs('#completeAllBtn').addEventListener('click', onCompleteAll);
  qs('#taskTitle').addEventListener('change', onRenameMain);

  qs('#search').addEventListener('input', renderMainList);

  qs('#exportBtn').addEventListener('click', onExport);
  qs('#importBtn').addEventListener('click', () => qs('#importFile').click());
  qs('#importFile').addEventListener('change', onImport);
}

function uid(){
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Рендер главных заданий
function renderMainList(){
  const list = qs('#mainList');
  list.innerHTML = '';
  const query = qs('#search').value?.toLowerCase() || '';

  state.tasks
    .filter(t => t.title.toLowerCase().includes(query))
    .forEach(task => {
      const tpl = qs('#mainItemTpl').content.cloneNode(true);
      const li = tpl.querySelector('.main-item');
      const btn = tpl.querySelector('.main-item-btn');
      const renameBtn = tpl.querySelector('[data-action="rename"]');
      const delBtn = tpl.querySelector('[data-action="delete"]');

      const done = (task.subtasks||[]).filter(s => s.done).length;
      const total = (task.subtasks||[]).length;
      btn.textContent = total ? `${task.title}  •  ${done}/${total}` : task.title;

      btn.addEventListener('click', () => selectTask(task.id));
      renameBtn.addEventListener('click', async () => {
        const title = prompt('Новое название задания', task.title);
        if (title && title.trim()){
          task.title = title.trim();
          await persist();
          renderMainList();
          if (state.selectedId === task.id) renderTaskView();
        }
      });
      delBtn.addEventListener('click', async () => {
        if (confirm('Удалить главное задание?')){
          state.tasks = state.tasks.filter(t => t.id !== task.id);
          if (state.selectedId === task.id) state.selectedId = null;
          await persist();
          renderMainList();
          renderTaskView();
        }
      });

      if (state.selectedId === task.id){
        li.style.outline = '1px solid var(--accent)';
      }
      list.appendChild(tpl);
    });
}

function selectTask(id){
  state.selectedId = id;
  renderMainList();
  renderTaskView();
}

function getSelected(){
  return state.tasks.find(t => t.id === state.selectedId) || null;
}

// Рендер правой панели
function renderTaskView(){
  const empty = qs('#emptyState');
  const view = qs('#taskView');
  const titleInput = qs('#taskTitle');
  const subList = qs('#subList');

  const task = getSelected();
  if (!task){
    empty.classList.remove('hidden');
    view.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  view.classList.remove('hidden');

  titleInput.value = task.title;
  subList.innerHTML = '';

  (task.subtasks || []).forEach(sub => {
    const tpl = qs('#subItemTpl').content.cloneNode(true);
    const li = tpl.querySelector('.sub-item');
    const check = tpl.querySelector('.sub-check');
    const text = tpl.querySelector('.sub-text');
    const delBtn = tpl.querySelector('[data-action="delete"]');

    check.checked = !!sub.done;
    text.value = sub.text;

    check.addEventListener('change', async () => {
      sub.done = check.checked;
      await persist();
      renderProgress(task);
      renderMainList();
    });

    text.addEventListener('change', async () => {
      const v = text.value.trim();
      if (v.length === 0){
        text.value = sub.text; // откат
        return;
      }
      sub.text = v;
      await persist();
      renderMainList();
    });

    // двойной клик по тексту — быстрое переключение
    text.addEventListener('dblclick', () => {
      check.checked = !check.checked;
      check.dispatchEvent(new Event('change'));
    });

    delBtn.addEventListener('click', async () => {
      const idx = task.subtasks.findIndex(s => s.id === sub.id);
      task.subtasks.splice(idx,1);
      await persist();
      renderTaskView();
      renderMainList();
    });

    subList.appendChild(tpl);
  });

  renderProgress(task);
}

function renderProgress(task){
  const done = (task.subtasks||[]).filter(s => s.done).length;
  const total = (task.subtasks||[]).length;
  const pct = total ? Math.round(done/total*100) : 0;
  qs('#progressBar').style.width = pct + '%';
  qs('#progressText').textContent = `${done} / ${total}`;
}

// Handlers
async function onAddMain(){
  const title = await showPrompt("Название главного задания");
  if (!title || !title.trim()) return;
  const task = { id: uid(), title: title.trim(), subtasks: [] };
  state.tasks.unshift(task);
  state.selectedId = task.id;
  await persist();
  renderMainList();
  renderTaskView();
}

async function onAddSub(){
  const task = getSelected();
  if (!task) return;
  const text = await showPrompt("Текст подзадания");
  if (!text || !text.trim()) return;
  task.subtasks.push({ id: uid(), text: text.trim(), done: false });
  await persist();
  renderTaskView();
  renderMainList();
}

async function onDeleteMain(){
  const task = getSelected();
  if (!task) return;
  if (!confirm('Удалить главное задание целиком?')) return;
  state.tasks = state.tasks.filter(t => t.id !== task.id);
  state.selectedId = null;
  await persist();
  renderMainList();
  renderTaskView();
}

async function onCompleteAll(){
  const task = getSelected();
  if (!task) return;
  (task.subtasks||[]).forEach(s => s.done = true);
  await persist();
  renderTaskView();
  renderMainList();
}

async function onRenameMain(){
  const task = getSelected();
  if (!task) return;
  const v = this.value.trim();
  if (v.length === 0){
    this.value = task.title; // откат
    return;
  }
  task.title = v;
  await persist();
  renderMainList();
}

async function persist(){
  await window.api.saveTasks(state.tasks);
}

// Экспорт/импорт JSON
function onExport(){
  const data = JSON.stringify({ tasks: state.tasks }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'quest-notes-export.json';
  a.click();
  URL.revokeObjectURL(url);
}

function onImport(e){
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try{
      const parsed = JSON.parse(reader.result);
      if (!parsed || !Array.isArray(parsed.tasks)) throw new Error('Некорректный формат');
      state.tasks = parsed.tasks;
      state.selectedId = state.tasks[0]?.id || null;
      await persist();
      renderMainList();
      renderTaskView();
    }catch(err){
      alert('Ошибка импорта: ' + err.message);
    }finally{
      e.target.value = '';
    }
  };
  reader.readAsText(file);
}

function showPrompt(title, defaultValue = "") {
  return new Promise((resolve) => {
    const modal = qs("#modal");
    const modalTitle = qs("#modalTitle");
    const modalInput = qs("#modalInput");
    const okBtn = qs("#modalOk");
    const cancelBtn = qs("#modalCancel");

    modal.classList.remove("hidden");
    modalTitle.textContent = title;
    modalInput.value = defaultValue;
    modalInput.focus();

    function close(val) {
      modal.classList.add("hidden");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      resolve(val);
    }

    function onOk() {
      close(modalInput.value.trim() || null);
    }
    function onCancel() {
      close(null);
    }

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
  });
}

function showModal() {
  const modal = document.getElementById("taskModal");
  const input = document.getElementById("taskInput");

  modal.classList.remove("hiding");
  modal.classList.add("show");

  input.value = "";
  input.focus();
}

function hideModal() {
  const modal = document.getElementById("taskModal");
  modal.classList.add("hiding");
  modal.classList.remove("show");

  setTimeout(() => {
    modal.classList.remove("hiding");
  }, 300);
}

// обработка кнопки "ОК"
document.getElementById("modalOk").addEventListener("click", () => {
  const input = document.getElementById("taskInput");
  const taskText = input.value.trim();

  if (taskText) {
    addTask(taskText); // добавляем задание
    hideModal();
  } else {
    alert("Введите название задания!");
  }
});

// обработка кнопки "Отмена"
document.getElementById("modalCancel").addEventListener("click", () => {
  hideModal();
});

