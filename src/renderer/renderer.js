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
  qs('#addTagBtn').addEventListener('click', onAddTag);

  qs('#addDescBtn').addEventListener('click', onAddDesc);

  qs('#search').addEventListener('input', renderMainList);
  qs('#sortSelect').addEventListener('change', renderMainList);

  qs('#exportBtn').addEventListener('click', onExport);
  qs('#importBtn').addEventListener('click', () => qs('#importFile').click());
  qs('#importFile').addEventListener('change', onImport);
  qs("#modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") {
    qs("#modalCancel").click();
  }
});

}

function uid(){
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Рендер главных заданий
function renderMainList() {
  const list = qs('#mainList');
  list.innerHTML = '';
  const query = qs('#search').value?.toLowerCase() || '';
  const sort = qs('#sortSelect')?.value || 'default'; // выбранная сортировка

  let tasks = state.tasks.filter(t => t.title.toLowerCase().includes(query));

  // --- сортировка ---
  if (sort === "alpha") {
    tasks.sort((a, b) => a.title.localeCompare(b.title));
  }
  if (sort === "progress") {
    tasks.sort((a, b) => {
      const doneA = (a.subtasks||[]).filter(s => s.done).length;
      const totalA = (a.subtasks||[]).length;
      const doneB = (b.subtasks||[]).filter(s => s.done).length;
      const totalB = (b.subtasks||[]).length;
      const pctA = totalA ? doneA / totalA : 0;
      const pctB = totalB ? doneB / totalB : 0;
      return pctB - pctA; // сначала с большим прогрессом
    });
  }
  if (sort === "created") {
    // сортировка по "новизне" id
    tasks.sort((a, b) => parseInt(b.id.slice(-8), 36) - parseInt(a.id.slice(-8), 36));
  }
  // default = ничего не делаем

  tasks.forEach(task => {
    const tpl = qs('#mainItemTpl').content.cloneNode(true);
    const li = tpl.querySelector('.main-item');
    const expandBtn = tpl.querySelector('.expand-btn');
    const btn = tpl.querySelector('.main-item-btn');
    const renameBtn = tpl.querySelector('[data-action="rename"]');
    const delBtn = tpl.querySelector('[data-action="delete"]');
    const addTaskBtn = tpl.querySelector('[data-action="addTask"]');

    const done = (task.subtasks||[]).filter(s => s.done).length;
    const total = (task.subtasks||[]).length;
    btn.textContent = total ? `${task.title}  •  ${done}/${total}` : task.title;

    // стрелочка
    expandBtn.textContent = task.expanded ? "▼" : "▶";
    expandBtn.addEventListener("click", () => {
      task.expanded = !task.expanded;
      renderMainList();
    });

    btn.addEventListener('click', () => selectTask(task.id));

    const nestedUl = document.createElement("ul");
    nestedUl.className = "nested-subtasks";

    if (task.expanded && task.subtasks?.length) {
      task.subtasks.forEach(s => s.parentId = task.id);
      renderSubtasksLeft(task.subtasks, nestedUl);
    }

    renameBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const title = await showPrompt("Новое название задания", task.title);
      if (title && title.trim()){
        task.title = title.trim();
        await persist();
        renderMainList();
        if (state.selectedId === task.id) renderTaskView();
      }
    });

    delBtn.addEventListener('click', async () => {
      const confirmed = await showConfirm("Удалить главное задание целиком?");
      if (!confirmed) return;
      state.tasks = state.tasks.filter(t => t.id !== task.id);
      if (state.selectedId === task.id) state.selectedId = null;
      await persist();
      renderMainList();
      renderTaskView();
    });

    // ➕ Добавить подзадание
    addTaskBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const text = await showPrompt("Введите текст подзадания");
      if (text && text.trim()) {
        task.subtasks.push({ id: uid(), text: text.trim(), done: false, important: false });
        task.expanded = true;
        await persist();
        renderMainList();
        if (state.selectedId === task.id) renderTaskView();
      }
    });

    // вложенные подзадания
    if (task.expanded && task.subtasks?.length) {
      const ul = li.querySelector('.nested-subtasks');
      ul.innerHTML = '';

      task.subtasks.forEach((sub) => {
        const liSub = document.createElement('li');

        const textSpan = document.createElement("span");
        textSpan.textContent = sub.text;
        liSub.appendChild(textSpan);

        if (sub.important) {
          const mark = document.createElement("span");
          mark.textContent = " !";
          mark.style.color = "gold";
          mark.style.fontWeight = "bold";
          mark.style.fontSize = "18px";
          mark.style.marginLeft = "4px";
          liSub.appendChild(mark);
        }

        if (sub.done) liSub.classList.add("done");

        liSub.addEventListener("dblclick", async () => {
          sub.done = !sub.done;
          await persist();
          renderMainList();
          if (state.selectedId === task.id) renderTaskView();
        });
      });

      btn.after(nestedUl);
    }

    if (state.selectedId === task.id){
      li.classList.add("selected");
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
  const descBox = qs('#taskDesc');
  const descBtn = qs('#addDescBtn');
  const tagBox = qs('#taskTags');

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

  // --- описание ---
  if (task.desc && task.desc.trim()){
    descBox.textContent = task.desc;
    descBox.classList.remove('hidden');
    descBtn.textContent = "Изменить описание";
  } else {
    descBox.classList.add('hidden');
    descBox.textContent = "";
    descBtn.textContent = "Добавить описание";
  }

  // --- подзадания ---
subList.innerHTML = '';
renderSubtasks(task.subtasks || [], subList);


  // --- теги ---
// --- теги ---
tagBox.innerHTML = '';
(task.tags || []).forEach(tag => {
  const span = document.createElement('span');
  span.className = 'tag';
  span.style.backgroundColor = tag.color;

  // Текст тега
  const text = document.createElement('span');
  text.textContent = tag.text;

  // Кнопка удаления
  const removeBtn = document.createElement('button');
  removeBtn.className = 'tag-remove';
  removeBtn.textContent = '×';

  removeBtn.addEventListener('click', async (e) => {
    e.stopPropagation(); // чтобы не срабатывали другие события
    task.tags = task.tags.filter(t => t.text !== tag.text);
    await persist();
    renderTaskView();
  });

  span.appendChild(text);
  span.appendChild(removeBtn);
  tagBox.appendChild(span);
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
  const task = { id: uid(), title: title.trim(), subtasks: [], tags: [] };
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

async function onDeleteMain() {
  const task = getSelected();
  if (!task) return;

  // Показываем модальное окно с кнопками Да/Нет
  const confirmed = await showConfirm("Удалить главное задание целиком?");
  if (!confirmed) return;

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
    setTimeout(() => {
    modalInput.focus();
    modalInput.select(); // сразу выделяет весь текст
    }, 0);


    function close(val) {
      modal.classList.add("hidden");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      modal.removeEventListener("keydown", onKey);
      resolve(val);
    }

    function onOk() {
      close(modalInput.value.trim() || null);
    }
    function onCancel() {
      close(null);
    }

        function onKey(e) {
      if (e.key === "Enter" && !e.shiftKey) onOk();
      if (e.key === "Escape") onCancel();
    }

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    modal.addEventListener("keydown", onKey);
  });

}

  async function onAddDesc() {
    const task = getSelected();
    if (!task) return;
    const text = await showPrompt("Описание задания", task.desc || "");
    if (text == null) return;
    task.desc = text.trim();
    await persist();
    renderTaskView();
  }

function showConfirm(message) {
  return new Promise((resolve) => {
    const modal = qs("#modal");
    const modalTitle = qs("#modalTitle");
    const modalInput = qs("#modalInput"); // можно скрыть
    const okBtn = qs("#modalOk");
    const cancelBtn = qs("#modalCancel");

    // Настройка
    modalTitle.textContent = message;
    modal.classList.remove("hidden");
    modalInput.classList.add("hidden"); // скрываем инпут

    function close(val) {
      modal.classList.add("hidden");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      modal.removeEventListener("keydown", onKey);
      modalInput.classList.remove("hidden"); // вернуть инпут на будущее
      resolve(val);
    }

    function onOk() { close(true); }
    function onCancel() { close(false); }

    function onKey(e) {
      if (e.key === "Enter") onOk();
      if (e.key === "Escape") onCancel();
    }

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    modal.addEventListener("keydown", onKey);
  });
}

async function onAddTag(){
  const task = getSelected();
  if (!task) return;

  const tag = await showTagCreator(getAllTags());
  if (!tag) return;

  task.tags = task.tags || [];
  if (!task.tags.some(t => t.text === tag.text)){
    task.tags.push({ text: tag.text, color: tag.color }); // копия
  }
  await persist();
  renderTaskView();
}




function getAllTags() {
  const all = state.tasks.flatMap(t => t.tags || []);
  const map = new Map();
  all.forEach(tag => {
    if (!map.has(tag.text)) {
      // кладём копию
      map.set(tag.text, { text: tag.text, color: tag.color });
    }
  });
  return [...map.values()];
}



function showTagCreator(existingTags){
  return new Promise((resolve) => {
    const modal = qs("#modal");
    const modalTitle = qs("#modalTitle");
    const modalInput = qs("#modalInput");
    const okBtn = qs("#modalOk");
    const cancelBtn = qs("#modalCancel");

    modal.classList.remove("hidden");
    modalTitle.textContent = "Введите тег или выберите из списка";
    modalInput.value = "";
    modalInput.classList.remove("hidden");

    // Список существующих тегов
    const select = document.createElement("select");
    const defaultOpt = document.createElement("option");
    defaultOpt.textContent = "— Выбрать существующий тег —";
    defaultOpt.value = "";
    select.appendChild(defaultOpt);

    existingTags.forEach(tag => {
      const opt = document.createElement("option");
      opt.value = tag.text;
      opt.textContent = tag.text;
      opt.style.backgroundColor = tag.color;
      select.appendChild(opt);
    });

    modalTitle.after(select);

    // Цвета для нового тега
    const colors = ["#ff4d4f","#1890ff","#52c41a","#faad14","#722ed1","#13c2c2","#595959"];
    const colorBox = document.createElement("div");
    colorBox.className = "color-select-box";

    let selectedColor = colors[0];
    colors.forEach(c => {
      const btn = document.createElement("button");
      btn.className = "color-option";
      btn.style.backgroundColor = c;
      btn.addEventListener("click", () => {
        selectedColor = c;
        [...colorBox.children].forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
      });
      colorBox.appendChild(btn);
    });

    select.after(colorBox);

    function close(val){
      modal.classList.add("hidden");
      select.remove();
      colorBox.remove();
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      resolve(val);
    }

    function onOk(){
      // Если выбран готовый тег → возвращаем его
      const selected = select.value;
      if (selected) {
        const tag = existingTags.find(t => t.text === selected);
        return close({ text: tag.text, color: tag.color });
      }

      // Если создаётся новый тег
      if (!modalInput.value.trim()) return;
      close({ text: modalInput.value.trim(), color: selectedColor });

    }
    function onCancel(){ close(null); }

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
  });
}


function onSubAction(e, sub, subEl) {
  const action = e.target.dataset.action;
  if (!action) return;

  if (action === "delete") {
    // удаление
  }

  if (action === "important") {
    sub.important = !sub.important;
    el.classList.toggle("important", subtask.important);
    updateUI();
  }
}

function renderSubtasks(subtasks, container, depth = 1) {
  container.innerHTML = '';

  subtasks.forEach(subtask => {
    const tpl = qs("#subItemTpl");
    const el = tpl.content.firstElementChild.cloneNode(true);

    const check = qs(".sub-check", el);
    const text = qs(".sub-text", el);
    const actions = qs(".sub-actions", el);
    const nested = qs(".nested-subtasks", el);

    check.checked = subtask.done;
    text.value = subtask.text || "";
    el.classList.toggle("important", subtask.important); 

    // если это под-подзадание (depth >= 2), убираем кнопку "+"
    if (depth >= 2) {
      const addBtn = actions.querySelector('[data-action="addSubtask"]');
      if (addBtn) addBtn.remove();
    }

    // чекбокс меняет done
    check.addEventListener("change", async () => {
      subtask.done = check.checked;
      await updateUI();
    });

    // редактирование текста
    text.addEventListener("input", async () => {
      subtask.text = text.value;
      await updateUI();
    });
    
    // действия кнопок
    actions.addEventListener("click", async e => {
      const action = e.target.dataset.action;
      if (!action) return;

      if (action === "important") {
        subtask.important = !subtask.important;
        el.classList.toggle("important", subtask.important);
        await updateUI();
      }

      if (action === "delete") {
        const idx = subtasks.indexOf(subtask);
        subtasks.splice(idx, 1);
        await updateUI();
      }

      if (action === "addSubtask" && depth < 2) {
        subtask.subtasks = subtask.subtasks || [];
        const text = await showPrompt("Введите текст под-подзадания");
        if (!text?.trim()) return;
        subtask.subtasks.push({ id: uid(), text: text.trim(), done: false, important: false, subtasks: [] });
        await updateUI();
      }
    });

    // рекурсивный рендер под-подзаданий
    if (subtask.subtasks?.length && depth < 2) {
      renderSubtasks(subtask.subtasks, nested, depth + 1);
    }

    container.appendChild(el);
  });
}




function countAllSubtasks(subtasks) {
  let total = subtasks.length;
  let done = subtasks.filter(s => s.done).length;
  return { total, done };
}

function updateProgress() {
  if (!state.selectedId) return;
  const task = state.tasks.find(t => t.id === state.selectedId);
  if (!task) return;

  const { total, done } = countAllSubtasks(task.subtasks || []);
  const bar = qs("#progressBar");
  const text = qs("#progressText");

  const percent = total > 0 ? (done / total) * 100 : 0;
  bar.style.width = percent + "%";
  text.textContent = `${done} / ${total}`;
}

function renderSubtasksLeft(subtasks, ul) {
  ul.innerHTML = '';
  subtasks.forEach(sub => {
    const li = document.createElement("li");
    li.textContent = sub.text;

    // важное подзадание
    if (sub.important) {
      const mark = document.createElement("span");
      mark.textContent = " !";
      mark.style.color = "gold";
      mark.style.fontWeight = "bold";
      mark.style.fontSize = "18px"; 
      mark.style.marginLeft = "4px"; 
      li.appendChild(mark);
    }

    li.classList.toggle("done", sub.done);

    // двойной клик
li.addEventListener("dblclick", async (e) => {
  e.stopPropagation();
  setDoneRecursive(sub, !sub.done); // переключаем все под-подзадания
  await updateUI(); // обновляем обе панели
});

    ul.appendChild(li);

    // рекурсивно под-подзадания
    if (sub.subtasks?.length) {
      const nestedUl = document.createElement("ul");
      nestedUl.className = "nested-subtasks";
      li.appendChild(nestedUl);
      renderSubtasksLeft(sub.subtasks, nestedUl);
    }
  });
}

function setDoneRecursive(subtask, value) {
  subtask.done = value;
  if (subtask.subtasks?.length) {
    subtask.subtasks.forEach(s => setDoneRecursive(s, value));
  }
}


async function updateUI() {
  await persist();
  renderMainList();   // левая панель
  renderTaskView();   // правая панель
}
