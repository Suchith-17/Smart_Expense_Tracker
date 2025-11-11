// assets/app.js
console.log("app.js loaded ✅");

// Use Lucide from CDN
const lucide = window.lucide;

(() => {
  'use strict';

  let chartInstances = {};
  let localExpenses = [];
  let localBudgets = [];
  let localRecurring = [];

  const categorySuggestions = new Map([
    [/coffee|starbucks|dunkin/i, 'Dining Out'],
    [/netflix|spotify|hulu|disney/i, 'Subscriptions'],
    [/amazon|walmart|target/i, 'Shopping'],
    [/uber|lyft|gas|subway/i, 'Transport'],
    [/rent|mortgage/i, 'Rent'],
    [/groceries|market|safeway/i, 'Groceries'],
    [/electric|water|internet|phone/i, 'Utilities']
  ]);

  // Category palettes: deterministic per category
  const CATEGORY_COLORS_LIGHT = {
    "Groceries":"#10b981","Utilities":"#60a5fa","Rent":"#f59e0b","Transport":"#f97316",
    "Dining Out":"#ec4899","Entertainment":"#8b5cf6","Subscriptions":"#22c55e","Shopping":"#06b6d4",
    "Health":"#ef4444","Salary":"#84cc16","Freelance":"#14b8a6","Other":"#94a3b8"
  };
  const CATEGORY_COLORS_DARK = {
    "Groceries":"#34d399","Utilities":"#93c5fd","Rent":"#fbbf24","Transport":"#fb923c",
    "Dining Out":"#f472b6","Entertainment":"#a78bfa","Subscriptions":"#4ade80","Shopping":"#22d3ee",
    "Health":"#f87171","Salary":"#a3e635","Freelance":"#2dd4bf","Other":"#cbd5e1"
  };
  const FALLBACK_LIGHT = ["#10b981","#60a5fa","#f59e0b","#f97316","#ec4899","#8b5cf6","#22c55e","#06b6d4","#ef4444","#84cc16","#14b8a6","#94a3b8"];
  const FALLBACK_DARK  = ["#34d399","#93c5fd","#fbbf24","#fb923c","#f472b6","#a78bfa","#4ade80","#22d3ee","#f87171","#a3e635","#2dd4bf","#cbd5e1"];

  // Theme on first paint
  function applyTheme() {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }
  applyTheme();

  // ==== Boot immediately (no auth) ====
  document.addEventListener("DOMContentLoaded", () => {
    // Set sidebar "Guest"
    const sidebarUser = document.getElementById("sidebar-user");
    if (sidebarUser) sidebarUser.textContent = "Guest";

    initUI();
    if (window.lucide) window.lucide.createIcons();
    lockChartHeights();
    setupChartResizeWatcher();
    loadAllData();
  });

  // ---- your existing logic (unchanged) ----

  function loadAllData() {
    loadDataFromLocalStorage();
    checkAndProcessRecurringExpenses();
    updateDashboardSummary(true);   // force show if you have data
    renderTransactionList();
    renderBudgetList();
    renderRecurringList();
    updateCharts();
  }

  function initUI() {
    // Theme Button (header)
    const themeToggle = document.getElementById("theme-toggle");
    if (themeToggle) {
      themeToggle.addEventListener("click", () => {
        const isDark = document.documentElement.classList.toggle("dark");
        localStorage.setItem("theme", isDark ? "dark" : "light");
        updateCharts();
        setTimeout(() => {
          if (chartInstances.bar) chartInstances.bar.resize();
          if (chartInstances.pie) chartInstances.pie.resize();
        }, 80);
      });
    }

    // Tabs
    document.querySelectorAll(".nav-tab-btn").forEach(button => {
      button.addEventListener("click", () => switchTab(button.dataset.tab));
    });

    // Modals
    document.getElementById("global-add-tx-btn")?.addEventListener("click", () => openTransactionModal());
    document.getElementById("empty-state-add-tx")?.addEventListener("click", () => openTransactionModal());
    document.getElementById("close-transaction-modal")?.addEventListener("click", closeTransactionModal);
    document.getElementById("open-add-budget-modal")?.addEventListener("click", openBudgetModal);
    document.getElementById("close-budget-modal")?.addEventListener("click", closeBudgetModal);
    document.getElementById("open-add-recurring-modal")?.addEventListener("click", openRecurringModal);
    document.getElementById("close-recurring-modal")?.addEventListener("click", closeRecurringModal);
    document.getElementById("message-box-ok")?.addEventListener("click", closeMessageBox);

    // Forms
    document.getElementById("transaction-form")?.addEventListener("submit", handleTransactionForm);
    document.getElementById("budget-form")?.addEventListener("submit", handleBudgetForm);
    document.getElementById("recurring-form")?.addEventListener("submit", handleRecurringForm);

    // Smart suggest
    document.getElementById("transaction-description")?.addEventListener("input", updateSmartSuggestion);
    document.getElementById("smart-suggestion-btn")?.addEventListener("click", applySmartSuggestion);

    // Lists delegation
    document.getElementById("transaction-list")?.addEventListener("click", e => {
      const edit = e.target.closest(".edit-tx-btn");
      const del = e.target.closest(".delete-tx-btn");
      if (edit) openTransactionModal(edit.dataset.id);
      if (del) handleDeleteTransaction(del.dataset.id);
    });

    document.getElementById("budget-list")?.addEventListener("click", e => {
      const del = e.target.closest(".delete-budget-btn");
      if (del) handleDeleteBudget(del.dataset.id);
    });

    document.getElementById("recurring-list")?.addEventListener("click", e => {
      const del = e.target.closest(".delete-recurring-btn");
      if (del) handleDeleteRecurring(del.dataset.id);
    });

    // Filters
    document.getElementById("tx-filter-description")?.addEventListener("input", renderTransactionList);
    document.getElementById("tx-filter-category")?.addEventListener("input", renderTransactionList);
    document.getElementById("tx-filter-type")?.addEventListener("input", renderTransactionList);
  }

  // Chart sizing guards
  function lockChartHeights() {
    ["bar-chart-container","pie-chart-container"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.height = "22rem";  // keep in sync with CSS
    });
  }
  function setupChartResizeWatcher() {
    const ro = new ResizeObserver(() => {
      if (chartInstances.bar) chartInstances.bar.resize();
      if (chartInstances.pie) chartInstances.pie.resize();
    });
    const bar = document.getElementById("bar-chart-container");
    const pie = document.getElementById("pie-chart-container");
    if (bar) ro.observe(bar);
    if (pie) ro.observe(pie);
  }

  // Storage
  function loadDataFromLocalStorage() {
    localExpenses = JSON.parse(localStorage.getItem("expenses")) || [];
    localBudgets = JSON.parse(localStorage.getItem("budgets")) || [];
    localRecurring = JSON.parse(localStorage.getItem("recurring")) || [];
    localExpenses.forEach(tx => tx.date = new Date(tx.date));
    localRecurring.forEach(r => r.nextDueDate = new Date(r.nextDueDate));
  }
  const saveExpenses = () => localStorage.setItem("expenses", JSON.stringify(localExpenses));
  const saveBudgets  = () => localStorage.setItem("budgets", JSON.stringify(localBudgets));
  const saveRecurring= () => localStorage.setItem("recurring", JSON.stringify(localRecurring));

  // Tabs
  function switchTab(id) {
    document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
    document.getElementById(`${id}-tab`).classList.remove("hidden");
    document.querySelectorAll(".nav-tab-btn").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(`.nav-tab-btn[data-tab="${id}"]`).forEach(btn => btn.classList.add("active"));
    if (id === "reports") {
      lockChartHeights();
      updateCharts();
      requestAnimationFrame(() => setTimeout(() => {
        if (chartInstances.bar) chartInstances.bar.resize();
        if (chartInstances.pie) chartInstances.pie.resize();
      }, 60));
    }
  }

  // Modals
  function openModal(id){const m=document.getElementById(id); m.classList.remove("hidden"); setTimeout(()=>{m.classList.remove("opacity-0"); m.querySelector(".modal-content").classList.remove("-translate-y-10");},10);}
  function closeModal(id){const m=document.getElementById(id); m.classList.add("opacity-0"); m.querySelector(".modal-content").classList.add("-translate-y-10"); setTimeout(()=>m.classList.add("hidden"),300);}
  function showMessage(t,x){document.getElementById("message-box-title").textContent=t;document.getElementById("message-box-text").textContent=x;openModal("message-box");}
  const closeMessageBox=()=>closeModal("message-box");

  function openTransactionModal(id=null){
    const f=document.getElementById("transaction-form"); f?.reset();
    const idEl = document.getElementById("transaction-id");
    if (idEl) idEl.value="";
    const dateEl = document.getElementById("transaction-date");
    if (dateEl) dateEl.value=new Date().toISOString().split("T")[0];
    document.getElementById("smart-suggestion-container")?.classList.add("hidden");
    const title=document.getElementById("transaction-modal-title");
    if(id){
      if (title) title.textContent="Edit Transaction";
      const tx=localExpenses.find(t=>t.id===id);
      if(tx){
        document.getElementById("transaction-id").value=tx.id;
        document.getElementById("transaction-type").value=tx.type;
        document.getElementById("transaction-description").value=tx.description;
        document.getElementById("transaction-amount").value=tx.amount;
        document.getElementById("transaction-category").value=tx.category;
        document.getElementById("transaction-date").value=new Date(tx.date).toISOString().split("T")[0];
      }
    } else if (title) title.textContent="New Transaction";
    openModal("transaction-modal");
  }
  const closeTransactionModal=()=>closeModal("transaction-modal");
  const openBudgetModal =()=>{document.getElementById("budget-form")?.reset(); const b=document.getElementById("budget-id"); if (b) b.value=""; openModal("budget-modal");};
  const closeBudgetModal=()=>closeModal("budget-modal");
  const openRecurringModal=()=>{document.getElementById("recurring-form")?.reset(); const r=document.getElementById("recurring-id"); if (r) r.value=""; const sd=document.getElementById("recurring-start-date"); if (sd) sd.value=new Date().toISOString().split("T")[0]; openModal("recurring-modal");};
  const closeRecurringModal=()=>closeModal("recurring-modal");

  // Smart Suggest
  function updateSmartSuggestion(e){
    const d=e.target.value || "";
    const c=document.getElementById("smart-suggestion-container");
    const b=document.getElementById("smart-suggestion-btn");
    if(!c || !b) return;
    if(d.length<3) return c.classList.add("hidden");
    for(const [regex,cat] of categorySuggestions.entries()){
      if(regex.test(d)){ b.textContent=cat; b.dataset.category=cat; return c.classList.remove("hidden"); }
    }
    c.classList.add("hidden");
  }
  const applySmartSuggestion=()=>{const b=document.getElementById("smart-suggestion-btn"); if(b?.dataset.category){document.getElementById("transaction-category").value=b.dataset.category;} document.getElementById("smart-suggestion-container")?.classList.add("hidden");};

  // Forms
  function handleTransactionForm(e){
    e.preventDefault();
    const id=document.getElementById("transaction-id").value;
    const data={
      id:id||crypto.randomUUID(),
      description:(document.getElementById("transaction-description").value||"").trim(),
      amount:parseFloat(document.getElementById("transaction-amount").value)||0,
      category:document.getElementById("transaction-category").value,
      type:document.getElementById("transaction-type").value,
      date:new Date(document.getElementById("transaction-date").value),
    };
    if (isNaN(data.date.getTime())) data.date = new Date();

    if(id){
      const i=localExpenses.findIndex(x=>x.id===id);
      if(i>-1) localExpenses[i]=data;
      showMessage("Success","Transaction updated!");
    } else {
      localExpenses.push(data);
      showMessage("Success","Transaction added!");
    }
    saveExpenses();
    updateDashboardSummary(true);
    closeTransactionModal();
    renderTransactionList();
    renderBudgetList();
    updateCharts();
  }

  function handleDeleteTransaction(id){
    localExpenses=localExpenses.filter(x=>x.id!==id);
    saveExpenses();
    updateDashboardSummary();
    renderTransactionList();
    renderBudgetList();
    updateCharts();
    showMessage("Success","Transaction deleted.");
  }

  function handleBudgetForm(e){
    e.preventDefault();
    const c=document.getElementById("budget-category").value;
    const d={id:c,category:c,amount:parseFloat(document.getElementById("budget-amount").value)||0};
    const i=localBudgets.findIndex(b=>b.id===c);
    if(i>-1) localBudgets[i]=d; else localBudgets.push(d);
    saveBudgets(); renderBudgetList(); showMessage("Success","Budget saved!"); closeBudgetModal();
  }
  function handleDeleteBudget(id){
    localBudgets=localBudgets.filter(x=>x.id!==id);
    saveBudgets(); renderBudgetList(); showMessage("Success","Budget deleted.");
  }

  function handleRecurringForm(e){
    e.preventDefault();
    const d={id:crypto.randomUUID(),
      description:(document.getElementById("recurring-description").value||"").trim(),
      amount:parseFloat(document.getElementById("recurring-amount").value)||0,
      category:document.getElementById("recurring-category").value,
      frequency:document.getElementById("recurring-frequency").value,
      nextDueDate:new Date(document.getElementById("recurring-start-date").value)};
    if (isNaN(d.nextDueDate.getTime())) d.nextDueDate = new Date();
    localRecurring.push(d);
    saveRecurring(); renderRecurringList(); showMessage("Success","Recurring saved!"); closeRecurringModal();
  }
  function handleDeleteRecurring(id){
    localRecurring=localRecurring.filter(x=>x.id!==id);
    saveRecurring(); renderRecurringList(); showMessage("Success","Recurring deleted.");
  }

  // Recurring engine
  function checkAndProcessRecurringExpenses(){
    const now=new Date(); let changed=false;
    const overdue=localRecurring.filter(r=>r.nextDueDate<=now);
    for(const r of overdue){
      localExpenses.push({id:crypto.randomUUID(),description:r.description,amount:r.amount,category:r.category,type:"expense",date:r.nextDueDate,addedBy:"recurring"});
      if(r.frequency==="monthly") r.nextDueDate=new Date(r.nextDueDate.setMonth(r.nextDueDate.getMonth()+1));
      else if(r.frequency==="weekly") r.nextDueDate=new Date(r.nextDueDate.setDate(r.nextDueDate.getDate()+7));
      else if(r.frequency==="yearly") r.nextDueDate=new Date(r.nextDueDate.setFullYear(r.nextDueDate.getFullYear()+1));
      changed=true;
    }
    if(changed){saveExpenses(); saveRecurring();}
  }

  // Summary
  function getMonthlySummary(expenses){
    const now=new Date();
    const start=new Date(now.getFullYear(),now.getMonth(),1);
    let inc=0,exp=0;
    const list=expenses.filter(x=>{
      const d=new Date(x.date);
      return !isNaN(d) && d >= start;
    });
    for(const x of list){ if(x.type==="income") inc+=x.amount; else exp+=x.amount; }
    return {totalIncome:inc,totalExpenses:exp,totalBalance:inc-exp,monthlyExpenses:list};
  }

  function updateDashboardSummary(forceShow=false){
    const {totalIncome,totalExpenses,totalBalance,monthlyExpenses}=getMonthlySummary(localExpenses);
    const empty=document.getElementById("dashboard-empty-state");
    const cards=document.getElementById("dashboard-summary-cards");
    const actions=document.getElementById("dashboard-quick-actions");

    if(monthlyExpenses.length===0 && !forceShow){
      empty?.classList.remove("hidden"); cards?.classList.add("hidden"); actions?.classList.add("hidden");
    } else {
      empty?.classList.add("hidden"); cards?.classList.remove("hidden"); actions?.classList.remove("hidden");
      document.getElementById("summary-balance").textContent=`$${(totalBalance||0).toFixed(2)}`;
      document.getElementById("summary-income").textContent=`$${(totalIncome||0).toFixed(2)}`;
      document.getElementById("summary-expenses").textContent=`$${(totalExpenses||0).toFixed(2)}`;
    }
  }

  // Lists
  function renderTransactionList(){
    const el=document.getElementById("transaction-list");
    const ph=document.getElementById("tx-list-placeholder");
    const desc=(document.getElementById("tx-filter-description")?.value||"").toLowerCase();
    const cat=document.getElementById("tx-filter-category")?.value || "";
    const type=document.getElementById("tx-filter-type")?.value || "";
    const filtered=localExpenses
      .filter(t=>(t.description||"").toLowerCase().includes(desc) && (!cat || t.category===cat) && (!type || t.type===type))
      .sort((a,b)=>new Date(b.date)-new Date(a.date));
    if(!filtered.length){if(el) el.innerHTML=""; el?.classList.add("hidden"); ph?.classList.remove("hidden"); return;}
    el?.classList.remove("hidden"); ph?.classList.add("hidden");
    el.innerHTML=filtered.map(tx=>{
      const date=new Date(tx.date).toLocaleDateString("en-US",{month:"short",day:"numeric"});
      const isInc=tx.type==="income";
      const color=isInc?"text-green-600 dark:text-green-400":"text-red-600 dark:text-red-400";
      const icon=isInc?"trending-up":"trending-down";
      return `
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 flex items-center space-x-4">
        <div class="p-3 rounded-full ${isInc?'bg-green-100 dark:bg-green-900':'bg-red-100 dark:bg-red-900'} ${color}">
          <i data-lucide="${icon}" class="w-5 h-5"></i>
        </div>
        <div class="flex-1">
          <p class="font-semibold">${tx.description}</p>
          <p class="text-sm opacity-70">${tx.category} • ${date}</p>
        </div>
        <div class="text-right">
          <p class="font-bold ${color}">${isInc?'+':'-'}$${tx.amount.toFixed(2)}</p>
          <div class="flex gap-2 mt-1 justify-end">
            <button class="edit-tx-btn" data-id="${tx.id}"><i data-lucide="edit-2"></i></button>
            <button class="delete-tx-btn" data-id="${tx.id}"><i data-lucide="trash-2"></i></button>
          </div>
        </div>
      </div>`;
    }).join("");
    lucide?.createIcons();
  }

  function renderBudgetList(){
    const el=document.getElementById("budget-list");
    const ph=document.getElementById("budget-list-placeholder");
    if(!localBudgets.length){if(el) el.innerHTML=""; el?.classList.add("hidden"); ph?.classList.remove("hidden"); return;}
    el?.classList.remove("hidden"); ph?.classList.add("hidden");
    const now=new Date(); const start=new Date(now.getFullYear(),now.getMonth(),1);
    const spentMap=new Map();
    localExpenses
      .filter(x=>new Date(x.date)>=start&&x.type==="expense")
      .forEach(x=>spentMap.set(x.category,(spentMap.get(x.category)||0)+x.amount));
    el.innerHTML=localBudgets.map(b=>{
      const spent=spentMap.get(b.category)||0;
      const remaining=b.amount-spent;
      const pct=b.amount>0 ? (spent/b.amount)*100 : 0;
      let bar="bg-teal-500"; if(pct>75) bar="bg-yellow-500"; if(pct>=100) bar="bg-red-500";
      return `
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <div class="flex justify-between mb-2">
          <span class="font-semibold text-lg">${b.category}</span>
          <button class="delete-budget-btn px-3 py-1 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-md" data-id="${b.id}">Delete</button>
        </div>
        <p class="text-sm opacity-70 mb-2">$${spent.toFixed(2)} spent of $${b.amount.toFixed(2)}</p>
        <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-2">
          <div class="${bar} h-2.5 rounded-full" style="width:${Math.min(pct,100)}%"></div>
        </div>
        <p class="text-sm ${remaining<0?'text-red-500':'opacity-70'}">
          ${remaining<0?`$${Math.abs(remaining).toFixed(2)} over`:`$${remaining.toFixed(2)} remaining`}
        </p>
      </div>`;
    }).join("");
  }

  function renderRecurringList(){
    const el=document.getElementById("recurring-list");
    const ph=document.getElementById("recurring-list-placeholder");
    if(!localRecurring.length){if(el) el.innerHTML=""; el?.classList.add("hidden"); ph?.classList.remove("hidden"); return;}
    el?.classList.remove("hidden"); ph?.classList.add("hidden");
    localRecurring.sort((a,b)=>new Date(a.nextDueDate)-new Date(b.nextDueDate));
    el.innerHTML=localRecurring.map(r=>{
      const d=new Date(r.nextDueDate).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
      return `
      <li class="p-4 flex justify-between items-center">
        <div>
          <p class="font-semibold">${r.description} ($${r.amount.toFixed(2)})</p>
          <p class="text-sm opacity-70">Next: ${d} (${r.frequency})</p>
        </div>
        <button class="delete-recurring-btn px-3 py-1 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-md" data-id="${r.id}">Delete</button>
      </li>`;
    }).join("");
  }

  // Charts
  function updateCharts(){ _renderCharts(localExpenses); }

  function _renderCharts(expenses){
    const barWrap=document.getElementById("bar-chart-container");
    const pieWrap=document.getElementById("pie-chart-container");
    const ph=document.getElementById("reports-placeholder");
    if(!expenses.length){barWrap?.classList.add("hidden"); pieWrap?.classList.add("hidden"); ph?.classList.remove("hidden"); return;}
    barWrap?.classList.remove("hidden"); pieWrap?.classList.remove("hidden"); ph?.classList.add("hidden");

    const {pieData,barData}=aggregateChartData(expenses);
    const dark=document.documentElement.classList.contains("dark");
    const grid=dark?"rgba(255,255,255,0.1)":"rgba(0,0,0,0.08)";
    const text=dark?"#e5e7eb":"#374151";

    const commonOptions = {
      responsive:true,
      maintainAspectRatio:false,
      layout:{ padding:{ bottom:24, top:8, right:12, left:12 } },
      plugins:{
        legend:{
          position:"bottom",
          labels:{ color:text, boxWidth:14, boxHeight:14, usePointStyle:true, pointStyle:"circle" }
        },
        tooltip:{ enabled:true }
      }
    };

    // Pie
    const pieCtx=document.getElementById("pie-chart").getContext("2d");
    if(chartInstances.pie) chartInstances.pie.destroy();
    chartInstances.pie=new Chart(pieCtx,{
      type:"doughnut",
      data:pieData,
      options:{
        ...commonOptions,
        cutout:"55%",
        borderColor: dark ? "#0b0f14" : "#ffffff",
        radius:"90%"
      }
    });

    // Bar
    const barCtx=document.getElementById("bar-chart").getContext("2d");
    if(chartInstances.bar) chartInstances.bar.destroy();
    chartInstances.bar=new Chart(barCtx,{
      type:"bar",
      data:barData,
      options:{
        ...commonOptions,
        scales:{
          y:{ beginAtZero:true, grid:{ color:grid }, ticks:{ color:text } },
          x:{ grid:{ display:false }, ticks:{ color:text } }
        }
      }
    });
  }

  function aggregateChartData(expenses){
    const dark=document.documentElement.classList.contains("dark");
    const colorMap = dark ? CATEGORY_COLORS_DARK : CATEGORY_COLORS_LIGHT;
    const fallbacks = dark ? FALLBACK_DARK : FALLBACK_LIGHT;

    // Pie (this month by category)
    const map=new Map();
    const {monthlyExpenses}=getMonthlySummary(expenses);
    monthlyExpenses.forEach(x=>{
      if(x.type==="expense") map.set(x.category,(map.get(x.category)||0)+x.amount);
    });
    const labels = [...map.keys()];
    const values = [...map.values()];
    const bgColors = labels.map((label, idx) => colorMap[label] || fallbacks[idx % fallbacks.length]);

    const pieData={
      labels,
      datasets:[{
        data: values,
        backgroundColor: bgColors,
        borderWidth: 2
      }]
    };

    // Bar (last 6 months)
    const barData={labels:[],datasets:[
      {label:"Income", data:[], backgroundColor: dark ? "rgba(52,211,153,0.65)" : "rgba(16,185,129,0.75)", borderRadius:6},
      {label:"Expense", data:[], backgroundColor: dark ? "rgba(244,208,63,0.55)" : "rgba(244,208,63,0.65)", borderRadius:6}
    ]};
    const names=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const now=new Date();
    for(let i=5;i>=0;i--){
      const d=new Date(now.getFullYear(),now.getMonth()-i,1);
      const m=d.getMonth(),y=d.getFullYear();
      barData.labels.push(names[m]);
      let inc=0,exp=0;
      expenses.forEach(t=>{
        const dt=new Date(t.date);
        if(!isNaN(dt) && dt.getMonth()===m && dt.getFullYear()===y){
          if(t.type==="income") inc+=t.amount;
          else exp+=t.amount;
        }
      });
      barData.datasets[0].data.push(inc);
      barData.datasets[1].data.push(exp);
    }
    return {pieData,barData};
  }

})();
