'use strict';

// ============================================================
// GAME STATE
// ============================================================
const State = {
  scene: 'MainMenu',
  company: {
    cash: 50000,
    reputation: 50,
    employees: [],
    completedProjects: []
  },
  availableProjects: [],
  activeProject: null,
  simulation: {
    day: 0,
    progress: 0,
    bugs: 0,
    qualityBonus: 0,
    qualityPenalty: 0,
    budgetBonus: 0,
    deadlineBonus: 0,
    assignedEmployees: [],
    currentEvent: null,
    isComplete: false,
    log: []
  },
  projectResult: null,
  tutorial: { active: true, step: 0 },
  notification: null
};

// ============================================================
// UTILITIES
// ============================================================
function fmt$(n) {
  return '$' + Math.abs(Math.round(n)).toLocaleString();
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function difficultyClass(d) {
  return { Easy: 'tag-easy', Medium: 'tag-medium', Hard: 'tag-hard' }[d] || '';
}

function roleIcon(role) {
  return { Developer: '💻', QA: '🔍', Manager: '📊' }[role] || '👤';
}

function moraleBar(m) {
  const pct = Math.round(m * 100);
  const cls = pct >= 70 ? 'morale-high' : pct >= 40 ? 'morale-mid' : 'morale-low';
  return `<div class="mini-bar"><div class="mini-bar-fill ${cls}" style="width:${pct}%"></div></div>`;
}

// ============================================================
// SAVE MANAGER
// ============================================================
const SaveManager = {
  KEY: 'itfirm_save',
  save() {
    const data = {
      company: State.company,
      availableProjects: State.availableProjects,
      timestamp: Date.now()
    };
    localStorage.setItem(this.KEY, JSON.stringify(data));
    UI.showNotification('Game saved.', 'success');
  },
  load() {
    const raw = localStorage.getItem(this.KEY);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      State.company = data.company;
      State.availableProjects = data.availableProjects || [];
      return true;
    } catch (e) {
      return false;
    }
  },
  hasSave() {
    return !!localStorage.getItem(this.KEY);
  },
  deleteSave() {
    localStorage.removeItem(this.KEY);
  }
};

// ============================================================
// EMPLOYEE MANAGER
// ============================================================
const EmployeeManager = {
  getHireable() {
    const hiredIds = new Set(State.company.employees.map(e => e.id));
    return EMPLOYEE_POOL.filter(e => !hiredIds.has(e.id));
  },
  hire(employeeId) {
    const template = EMPLOYEE_POOL.find(e => e.id === employeeId);
    if (!template) return;
    if (State.company.cash < template.cost) {
      UI.showNotification('Not enough cash to hire ' + template.name + '!', 'error');
      return;
    }
    State.company.cash -= template.cost;
    State.company.employees.push(deepClone(template));
    UI.showNotification(template.name + ' joined the team!', 'success');
    UI.render();
  },
  release(employeeId) {
    State.company.employees = State.company.employees.filter(e => e.id !== employeeId);
    // Also remove from simulation if active
    if (State.simulation.assignedEmployees) {
      State.simulation.assignedEmployees = State.simulation.assignedEmployees.filter(e => e.id !== employeeId);
    }
    UI.render();
  },
  toggleAssign(employeeId) {
    const sim = State.simulation;
    const idx = sim.assignedEmployees.findIndex(e => e.id === employeeId);
    if (idx === -1) {
      const emp = State.company.employees.find(e => e.id === employeeId);
      if (emp) sim.assignedEmployees.push(emp);
    } else {
      sim.assignedEmployees.splice(idx, 1);
    }
    UI.render();
  },
  isAssigned(employeeId) {
    return State.simulation.assignedEmployees.some(e => e.id === employeeId);
  }
};

// ============================================================
// PROJECT MANAGER — SIMULATION FORMULAS
// ============================================================
const ProjectManager = {
  getTeamMorale() {
    const team = State.simulation.assignedEmployees;
    if (!team.length) return 0;
    const avg = team.reduce((s, e) => s + e.morale, 0) / team.length;
    const hasManager = team.some(e => e.role === 'Manager');
    return clamp(avg + (hasManager ? 0.10 : 0), 0, 1);
  },

  getDailyProgress() {
    const devs = State.simulation.assignedEmployees.filter(e => e.role === 'Developer');
    if (!devs.length) return 0;
    const totalSpeed = devs.reduce((s, d) => s + d.speed, 0);
    const morale = this.getTeamMorale();
    const diffMod = State.activeProject.difficultyMod;
    // progress_per_day = sum(dev.speed) * difficulty_modifier * morale_modifier
    return totalSpeed * diffMod * morale;
  },

  getDailyBugs() {
    const devs = State.simulation.assignedEmployees.filter(e => e.role === 'Developer');
    if (!devs.length) return 0;
    const totalSpeed = devs.reduce((s, d) => s + d.speed, 0);
    const avgQuality = devs.reduce((s, d) => s + d.quality, 0) / devs.length;
    const bugMod = State.activeProject.bugMod;
    // bugs_per_day = sum(dev.speed) * (1 - avg(dev.quality)) * difficulty_modifier
    return totalSpeed * (1 - avgQuality) * bugMod;
  },

  getDailyQAFix() {
    const qas = State.simulation.assignedEmployees.filter(e => e.role === 'QA');
    // Each QA removes bugs proportional to their speed and quality
    return qas.reduce((s, qa) => s + qa.speed * qa.quality * 0.8, 0);
  },

  computeFinalQuality() {
    const sim = State.simulation;
    const qas = sim.assignedEmployees.filter(e => e.role === 'QA');
    const qaEffect = qas.reduce((s, qa) => s + qa.speed * qa.quality * 1.5, 0);
    const bugPenalty = sim.bugs * 2;
    // final_quality = base_quality + QA_effect - bug_penalty + bonuses - penalties
    const quality = 50 + qaEffect - bugPenalty + sim.qualityBonus - sim.qualityPenalty;
    return clamp(Math.round(quality), 0, 100);
  },

  advanceDay() {
    const sim = State.simulation;
    const proj = State.activeProject;

    if (sim.currentEvent) return; // wait for event resolution
    if (sim.isComplete) return;

    sim.day++;

    // Calculate daily values
    const progressGain = this.getDailyProgress();
    const newBugs = Math.max(0, this.getDailyBugs());
    const qaFix = Math.max(0, this.getDailyQAFix());
    const netBugs = Math.max(0, newBugs - qaFix);

    sim.progress = clamp(sim.progress + progressGain, 0, 100);
    sim.bugs = Math.max(0, sim.bugs + netBugs);

    // Daily salary cost
    const dailySalary = sim.assignedEmployees.reduce((s, e) => s + e.cost, 0) / 22; // ~22 working days/month
    State.company.cash -= dailySalary;

    // Build log entry
    const morale = this.getTeamMorale();
    const logLine = `Day ${sim.day}: +${progressGain.toFixed(1)}% progress | `
      + `${netBugs > 0 ? '+' + netBugs.toFixed(1) + ' bugs' : 'QA cleared bugs'} | `
      + `Morale ${Math.round(morale * 100)}%`;
    sim.log.push(logLine);

    // Check for random event (30% chance, max 1 per day)
    if (Math.random() < 0.30 && !sim.currentEvent) {
      const evt = EventManager.pickEvent();
      if (evt) {
        sim.currentEvent = evt;
        UI.render();
        return;
      }
    }

    // Check completion
    const effectiveDeadline = proj.deadlineDays + sim.deadlineBonus;
    if (sim.progress >= 100) {
      this.completeProject(true, sim.day, effectiveDeadline);
    } else if (sim.day >= effectiveDeadline) {
      this.completeProject(false, sim.day, effectiveDeadline);
    } else {
      UI.render();
    }
  },

  completeProject(success, daysUsed, deadline) {
    const sim = State.simulation;
    const proj = State.activeProject;
    sim.isComplete = true;

    const quality = this.computeFinalQuality();
    const qualityFactor = quality / 100;
    const effectiveBudget = proj.budget + sim.budgetBonus;

    let income = 0, repChange = 0, outcome = '';

    if (success) {
      // rep_gain = project.budget * 0.01 * quality_factor
      income = effectiveBudget;
      repChange = Math.round(effectiveBudget * 0.01 * qualityFactor);
      outcome = 'SUCCESS';
    } else {
      const daysLate = daysUsed - deadline;
      // rep_loss = 5 * days_late
      repChange = -Math.min(25, 5 * daysLate);
      income = Math.round(effectiveBudget * 0.3); // partial payment on failure
      outcome = 'FAILURE';
    }

    State.company.cash += income;
    State.company.reputation = clamp(State.company.reputation + repChange, 0, 100);
    State.company.completedProjects.push(proj.id);

    State.projectResult = {
      outcome,
      success,
      projectTitle: proj.title,
      daysUsed,
      deadline,
      quality,
      qualityTarget: proj.qualityTarget,
      income,
      repChange,
      bugs: sim.bugs,
      budgetBonus: sim.budgetBonus
    };

    // Refresh available projects after completing one
    ProjectManager.refreshAvailableProjects();

    SaveManager.save();
    GameManager.goTo('ProjectResult');
  },

  refreshAvailableProjects() {
    const done = new Set(State.company.completedProjects);
    const available = PROJECT_POOL.filter(p => !done.has(p.id));
    State.availableProjects = pick(available, Math.min(3, available.length));
  }
};

// ============================================================
// EVENT MANAGER
// ============================================================
const EventManager = {
  usedEvents: new Set(),

  pickEvent() {
    const available = EVENT_POOL.filter(e => !this.usedEvents.has(e.id));
    if (!available.length) {
      this.usedEvents.clear(); // reset pool
      return null;
    }
    const evt = available[randInt(0, available.length - 1)];
    this.usedEvents.add(evt.id);
    return evt;
  },

  resolveEvent(optionIndex) {
    const sim = State.simulation;
    const evt = sim.currentEvent;
    if (!evt) return;

    const opt = evt.options[optionIndex];
    const fx = opt.effect;

    if (fx.progress !== undefined) sim.progress = clamp(sim.progress + fx.progress, 0, 100);
    if (fx.bugs !== undefined) sim.bugs = Math.max(0, sim.bugs + fx.bugs);
    if (fx.morale !== undefined) {
      sim.assignedEmployees.forEach(e => {
        e.morale = clamp(e.morale + fx.morale, 0.1, 1.0);
      });
    }
    if (fx.qualityBonus !== undefined) sim.qualityBonus += fx.qualityBonus;
    if (fx.qualityPenalty !== undefined) sim.qualityPenalty += fx.qualityPenalty;
    if (fx.budgetBonus !== undefined) sim.budgetBonus += fx.budgetBonus;
    if (fx.deadlineBonus !== undefined) sim.deadlineBonus += fx.deadlineBonus;
    if (fx.cashCost !== undefined) State.company.cash -= fx.cashCost;
    if (fx.reputationBonus !== undefined) {
      State.company.reputation = clamp(State.company.reputation + fx.reputationBonus, 0, 100);
    }
    if (fx.removeTopDev) {
      const devs = sim.assignedEmployees.filter(e => e.role === 'Developer');
      if (devs.length) {
        const topDev = devs.reduce((best, d) => d.speed > best.speed ? d : best, devs[0]);
        sim.assignedEmployees = sim.assignedEmployees.filter(e => e.id !== topDev.id);
        State.company.employees = State.company.employees.filter(e => e.id !== topDev.id);
        sim.log.push(`${topDev.name} left the company.`);
      }
    }

    sim.log.push(`Event resolved: "${opt.text}"`);
    sim.currentEvent = null;

    // Check completion after event
    const proj = State.activeProject;
    const effectiveDeadline = proj.deadlineDays + sim.deadlineBonus;
    if (sim.progress >= 100) {
      ProjectManager.completeProject(true, sim.day, effectiveDeadline);
    } else if (sim.day >= effectiveDeadline) {
      ProjectManager.completeProject(false, sim.day, effectiveDeadline);
    } else {
      UI.render();
    }
  }
};

// ============================================================
// GAME MANAGER — SCENE TRANSITIONS
// ============================================================
const GameManager = {
  goTo(scene) {
    State.scene = scene;
    UI.render();
    window.scrollTo(0, 0);
  },

  startNewGame() {
    State.company = {
      cash: 50000,
      reputation: 50,
      employees: STARTING_EMPLOYEE_IDS.map(id => deepClone(EMPLOYEE_POOL.find(e => e.id === id))),
      completedProjects: []
    };
    State.availableProjects = [];
    State.activeProject = null;
    State.projectResult = null;
    EventManager.usedEvents.clear();
    State.tutorial = { active: true, step: 0 };
    ProjectManager.refreshAvailableProjects();
    this.goTo('Dashboard');
  },

  loadGame() {
    if (SaveManager.load()) {
      EventManager.usedEvents.clear();
      this.goTo('Dashboard');
    } else {
      UI.showNotification('No save file found.', 'error');
    }
  },

  selectProject(projectId) {
    const proj = State.availableProjects.find(p => p.id === projectId);
    if (!proj) return;
    State.activeProject = deepClone(proj);
    this.goTo('ProjectDetail');
  },

  acceptProject() {
    if (!State.activeProject) return;
    // Reset simulation state
    State.simulation = {
      day: 0,
      progress: 0,
      bugs: 0,
      qualityBonus: 0,
      qualityPenalty: 0,
      budgetBonus: 0,
      deadlineBonus: 0,
      assignedEmployees: [],
      currentEvent: null,
      isComplete: false,
      log: []
    };
    this.goTo('TeamManagement');
  },

  rejectProject() {
    State.activeProject = null;
    this.goTo('Dashboard');
  },

  startSimulation() {
    const devs = State.simulation.assignedEmployees.filter(e => e.role === 'Developer');
    if (!devs.length) {
      UI.showNotification('Assign at least one Developer to the project!', 'error');
      return;
    }
    this.goTo('ProjectSimulation');
  },

  goToTeamManagement() {
    this.goTo('TeamManagement');
  },

  backToDashboard() {
    State.activeProject = null;
    State.projectResult = null;
    this.goTo('Dashboard');
  }
};

// ============================================================
// UI — RENDERING ENGINE
// ============================================================
const UI = {
  render() {
    document.getElementById('notification-bar').innerHTML = '';
    const scenes = ['MainMenu', 'Dashboard', 'ProjectDetail', 'TeamManagement',
      'ProjectSimulation', 'ProjectResult'];
    scenes.forEach(s => {
      const el = document.getElementById('scene-' + s);
      if (el) el.classList.toggle('hidden', State.scene !== s);
    });

    switch (State.scene) {
      case 'MainMenu':      this.renderMainMenu(); break;
      case 'Dashboard':     this.renderDashboard(); break;
      case 'ProjectDetail': this.renderProjectDetail(); break;
      case 'TeamManagement':this.renderTeamManagement(); break;
      case 'ProjectSimulation': this.renderSimulation(); break;
      case 'ProjectResult': this.renderProjectResult(); break;
    }

    this.renderTutorial();
  },

  showNotification(msg, type = 'info') {
    const bar = document.getElementById('notification-bar');
    bar.innerHTML = `<div class="notification ${type}">${msg}</div>`;
    setTimeout(() => { bar.innerHTML = ''; }, 3000);
  },

  // ---- MAIN MENU ----
  renderMainMenu() {
    document.getElementById('scene-MainMenu').innerHTML = `
      <div class="center-layout">
        <div class="logo-block">
          <div class="logo-icon">🏢</div>
          <h1 class="logo-title">IT Firm Simulator</h1>
          <p class="logo-sub">Build your software empire from the ground up</p>
        </div>
        <div class="menu-buttons">
          <button class="btn btn-primary btn-lg" onclick="GameManager.startNewGame()">New Game</button>
          ${SaveManager.hasSave()
            ? `<button class="btn btn-secondary btn-lg" onclick="GameManager.loadGame()">Continue</button>`
            : `<button class="btn btn-secondary btn-lg" disabled title="No save found">Continue</button>`}
        </div>
        <p class="version-tag">MVP v1.0</p>
      </div>`;
  },

  // ---- DASHBOARD ----
  renderDashboard() {
    const c = State.company;
    const projCards = State.availableProjects.length
      ? State.availableProjects.map(p => this._projectCard(p)).join('')
      : `<p class="empty-msg">No projects available. All done!</p>`;

    document.getElementById('scene-Dashboard').innerHTML = `
      <div class="game-header">
        <div class="header-brand">🏢 <strong>IT Firm Simulator</strong></div>
        <div class="header-stats">
          <div class="stat-chip">
            <span class="chip-label">Cash</span>
            <span class="chip-value green">${fmt$(c.cash)}</span>
          </div>
          <div class="stat-chip">
            <span class="chip-label">Reputation</span>
            <span class="chip-value">${c.reputation}/100</span>
          </div>
          <div class="stat-chip">
            <span class="chip-label">Projects Done</span>
            <span class="chip-value">${c.completedProjects.length}</span>
          </div>
        </div>
        <div class="header-actions">
          <button class="btn btn-sm" onclick="SaveManager.save()">Save</button>
        </div>
      </div>

      <div class="dashboard-body">
        <div class="dashboard-col">
          <div class="section-header">
            <h2>Available Projects</h2>
            <span class="badge">${State.availableProjects.length}</span>
          </div>
          <div class="project-list">${projCards}</div>
        </div>

        <div class="dashboard-col">
          <div class="section-header">
            <h2>Your Team</h2>
            <button class="btn btn-sm btn-primary" onclick="GameManager.goToTeamManagement()">Manage</button>
          </div>
          ${this._teamSummary()}
          <div class="rep-bar-wrap">
            <div class="rep-label">Reputation</div>
            <div class="rep-bar">
              <div class="rep-fill" style="width:${c.reputation}%"></div>
            </div>
            <span class="rep-val">${c.reputation}</span>
          </div>
        </div>
      </div>`;
  },

  _projectCard(p) {
    return `
      <div class="project-card" onclick="GameManager.selectProject('${p.id}')">
        <div class="project-card-header">
          <span class="project-title">${p.title}</span>
          <span class="tag ${difficultyClass(p.difficulty)}">${p.difficulty}</span>
        </div>
        <div class="project-card-meta">
          <span class="meta-item">📦 ${p.type}</span>
          <span class="meta-item">💰 ${fmt$(p.budget)}</span>
          <span class="meta-item">⏱ ${p.deadlineDays}d</span>
          <span class="meta-item risk-${p.riskLevel.toLowerCase()}">⚠ ${p.riskLevel} risk</span>
        </div>
        <p class="project-desc">${p.description}</p>
        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();GameManager.selectProject('${p.id}')">View Details</button>
      </div>`;
  },

  _teamSummary() {
    const emps = State.company.employees;
    if (!emps.length) return `<p class="empty-msg">No employees yet. Hire someone!</p>`;
    return `<div class="team-summary">
      ${emps.slice(0, 5).map(e => `
        <div class="emp-chip">
          <span class="emp-icon">${roleIcon(e.role)}</span>
          <span class="emp-name">${e.name}</span>
          <span class="emp-role tag">${e.role}</span>
        </div>`).join('')}
      ${emps.length > 5 ? `<div class="emp-chip more">+${emps.length - 5} more</div>` : ''}
    </div>`;
  },

  // ---- PROJECT DETAIL ----
  renderProjectDetail() {
    const p = State.activeProject;
    if (!p) return;
    document.getElementById('scene-ProjectDetail').innerHTML = `
      <div class="scene-container">
        <div class="back-row">
          <button class="btn btn-ghost" onclick="GameManager.rejectProject()">← Back</button>
        </div>
        <div class="detail-card">
          <div class="detail-header">
            <div>
              <h2>${p.title}</h2>
              <p class="detail-sub">${p.description}</p>
            </div>
            <span class="tag tag-lg ${difficultyClass(p.difficulty)}">${p.difficulty}</span>
          </div>

          <div class="detail-grid">
            <div class="detail-stat"><span class="ds-label">Type</span><span class="ds-val">📦 ${p.type}</span></div>
            <div class="detail-stat"><span class="ds-label">Budget</span><span class="ds-val green">${fmt$(p.budget)}</span></div>
            <div class="detail-stat"><span class="ds-label">Deadline</span><span class="ds-val">⏱ ${p.deadlineDays} days</span></div>
            <div class="detail-stat"><span class="ds-label">Risk</span><span class="ds-val risk-${p.riskLevel.toLowerCase()}">⚠ ${p.riskLevel}</span></div>
            <div class="detail-stat"><span class="ds-label">Quality Target</span><span class="ds-val">${p.qualityTarget}/100</span></div>
            <div class="detail-stat"><span class="ds-label">Difficulty Mod</span><span class="ds-val">${p.difficultyMod}x</span></div>
          </div>

          <div class="features-block">
            <h3>Required Features</h3>
            <div class="features-list">
              ${p.features.map(f => `<span class="feature-tag">${f}</span>`).join('')}
            </div>
          </div>

          ${this._projectFeasibility(p)}

          <div class="detail-actions">
            <button class="btn btn-danger" onclick="GameManager.rejectProject()">Reject</button>
            <button class="btn btn-primary btn-lg" onclick="GameManager.acceptProject()">Accept Project →</button>
          </div>
        </div>
      </div>`;
  },

  _projectFeasibility(p) {
    const devs = State.company.employees.filter(e => e.role === 'Developer');
    if (!devs.length) {
      return `<div class="feasibility warn">⚠ You have no developers! Hire some before accepting.</div>`;
    }
    const totalSpeed = devs.reduce((s, d) => s + d.speed, 0);
    const projectedDays = Math.ceil(100 / (totalSpeed * p.difficultyMod * 0.85));
    const feasible = projectedDays <= p.deadlineDays;
    return `<div class="feasibility ${feasible ? 'ok' : 'warn'}">
      ${feasible ? '✅' : '⚠'} Estimated completion: ~${projectedDays} days
      (deadline: ${p.deadlineDays}d) — ${feasible ? 'Feasible' : 'Tight deadline!'}
    </div>`;
  },

  // ---- TEAM MANAGEMENT ----
  renderTeamManagement() {
    const isAssigning = !!State.activeProject;
    const assigned = State.simulation.assignedEmployees;
    const hireable = EmployeeManager.getHireable();

    document.getElementById('scene-TeamManagement').innerHTML = `
      <div class="scene-container">
        <div class="back-row">
          <button class="btn btn-ghost" onclick="GameManager.goTo('${isAssigning ? 'ProjectDetail' : 'Dashboard'}')">← Back</button>
          <h2>${isAssigning ? `Assign Team — ${State.activeProject.title}` : 'Team Management'}</h2>
        </div>

        ${isAssigning ? `
          <div class="assignment-info">
            Assign Developers (required) and optionally QA testers and Managers.
            ${assigned.length} assigned.
          </div>` : ''}

        <div class="team-section">
          <h3>Your Employees (${State.company.employees.length})</h3>
          <div class="emp-list">
            ${State.company.employees.length
              ? State.company.employees.map(e => this._empRow(e, isAssigning)).join('')
              : '<p class="empty-msg">No employees. Hire from below!</p>'}
          </div>
        </div>

        ${isAssigning ? `
          <div class="assign-actions">
            <button class="btn btn-primary" onclick="GameManager.startSimulation()">
              Start Project (${assigned.filter(e=>e.role==='Developer').length} devs assigned) →
            </button>
          </div>` : ''}

        <div class="team-section">
          <h3>Available to Hire</h3>
          <div class="emp-list">
            ${hireable.length
              ? hireable.map(e => this._hireRow(e)).join('')
              : '<p class="empty-msg">All available candidates have been hired!</p>'}
          </div>
        </div>
      </div>`;
  },

  _empRow(e, showAssign) {
    const assigned = EmployeeManager.isAssigned(e.id);
    return `
      <div class="emp-row ${assigned ? 'assigned' : ''}">
        <div class="emp-row-icon">${roleIcon(e.role)}</div>
        <div class="emp-row-info">
          <div class="emp-row-name">${e.name} <span class="tag">${e.role}</span> <span class="tag tag-level">Lv${e.level}</span></div>
          <div class="emp-row-stats">
            <span title="Speed">⚡${e.speed}</span>
            <span title="Quality">✨${Math.round(e.quality*100)}%</span>
            <span title="Daily cost">💰${fmt$(e.cost/22)}/day</span>
            ${moraleBar(e.morale)}
            <span title="Morale">${Math.round(e.morale*100)}%</span>
          </div>
          <div class="emp-bio">${e.bio}</div>
        </div>
        <div class="emp-row-actions">
          ${showAssign
            ? `<button class="btn btn-sm ${assigned ? 'btn-danger' : 'btn-primary'}"
                onclick="EmployeeManager.toggleAssign('${e.id}')">
                ${assigned ? 'Unassign' : 'Assign'}
              </button>`
            : `<button class="btn btn-sm btn-ghost" onclick="EmployeeManager.release('${e.id}')">Release</button>`}
        </div>
      </div>`;
  },

  _hireRow(e) {
    const canAfford = State.company.cash >= e.cost;
    return `
      <div class="emp-row hire-row ${!canAfford ? 'cant-afford' : ''}">
        <div class="emp-row-icon">${roleIcon(e.role)}</div>
        <div class="emp-row-info">
          <div class="emp-row-name">${e.name} <span class="tag">${e.role}</span> <span class="tag tag-level">Lv${e.level}</span></div>
          <div class="emp-row-stats">
            <span title="Speed">⚡${e.speed}</span>
            <span title="Quality">✨${Math.round(e.quality*100)}%</span>
            <span title="Monthly cost">💰${fmt$(e.cost)}/mo</span>
          </div>
          <div class="emp-bio">${e.bio}</div>
        </div>
        <div class="emp-row-actions">
          <button class="btn btn-sm btn-success" onclick="EmployeeManager.hire('${e.id}')"
            ${!canAfford ? 'disabled title="Not enough cash"' : ''}>
            Hire ${fmt$(e.cost)}
          </button>
        </div>
      </div>`;
  },

  // ---- PROJECT SIMULATION ----
  renderSimulation() {
    const sim = State.simulation;
    const proj = State.activeProject;
    const effectiveDeadline = proj.deadlineDays + sim.deadlineBonus;
    const daysLeft = effectiveDeadline - sim.day;
    const morale = ProjectManager.getTeamMorale();
    const dailyProg = ProjectManager.getDailyProgress();
    const progressPct = clamp(sim.progress, 0, 100);
    const daysLeftClass = daysLeft <= 3 ? 'danger' : daysLeft <= 7 ? 'warn' : 'ok';

    document.getElementById('scene-ProjectSimulation').innerHTML = `
      <div class="scene-container sim-layout">
        <div class="sim-topbar">
          <div class="sim-title">
            <span class="tag ${difficultyClass(proj.difficulty)}">${proj.difficulty}</span>
            <h2>${proj.title}</h2>
          </div>
          <div class="sim-kpis">
            <div class="kpi"><span class="kpi-label">Day</span><span class="kpi-val">${sim.day}/${effectiveDeadline}</span></div>
            <div class="kpi ${daysLeftClass}"><span class="kpi-label">Days Left</span><span class="kpi-val">${daysLeft}</span></div>
            <div class="kpi"><span class="kpi-label">Bugs</span><span class="kpi-val ${sim.bugs > 10 ? 'danger' : ''}">${sim.bugs.toFixed(1)}</span></div>
            <div class="kpi"><span class="kpi-label">Morale</span><span class="kpi-val">${Math.round(morale*100)}%</span></div>
            <div class="kpi green"><span class="kpi-label">Cash</span><span class="kpi-val">${fmt$(State.company.cash)}</span></div>
          </div>
        </div>

        <div class="progress-section">
          <div class="progress-labels">
            <span>Progress</span>
            <span>${progressPct.toFixed(1)}%</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill ${progressPct > 75 ? 'near-done' : ''}" style="width:${progressPct}%"></div>
          </div>
          <div class="progress-sublabels">
            <span>+${dailyProg.toFixed(1)}%/day at current pace</span>
            <span>Target: ${proj.qualityTarget} quality</span>
          </div>
        </div>

        <div class="sim-body">
          <div class="sim-log-panel">
            <h3>Activity Log</h3>
            <div class="sim-log">
              ${sim.log.length
                ? [...sim.log].reverse().slice(0, 8).map(l => `<div class="log-entry">${l}</div>`).join('')
                : '<div class="log-entry muted">Simulation not started yet...</div>'}
            </div>
          </div>
          <div class="sim-team-panel">
            <h3>Assigned Team (${sim.assignedEmployees.length})</h3>
            ${sim.assignedEmployees.map(e => `
              <div class="sim-emp">
                ${roleIcon(e.role)} <strong>${e.name}</strong>
                <span class="tag">${e.role}</span>
                <div class="emp-row-stats">
                  <span>⚡${e.speed}</span> ${moraleBar(e.morale)} <span>${Math.round(e.morale*100)}%</span>
                </div>
              </div>`).join('')}
          </div>
        </div>

        ${sim.currentEvent ? this._eventModal() : `
          <div class="sim-controls">
            <button class="btn btn-primary btn-lg" onclick="ProjectManager.advanceDay()">
              Next Day ▶
            </button>
            <button class="btn btn-sm btn-ghost" onclick="GameManager.goToTeamManagement()">
              View Team
            </button>
          </div>`}
      </div>`;
  },

  _eventModal() {
    const evt = State.simulation.currentEvent;
    return `
      <div class="event-overlay">
        <div class="event-modal">
          <div class="event-icon">${evt.icon}</div>
          <h3 class="event-title">${evt.name}</h3>
          <p class="event-desc">${evt.description}</p>
          <div class="event-options">
            ${evt.options.map((opt, i) => `
              <button class="btn btn-option" onclick="EventManager.resolveEvent(${i})">
                <strong>${opt.text}</strong>
                <small>${opt.subtext}</small>
              </button>`).join('')}
          </div>
        </div>
      </div>`;
  },

  // ---- PROJECT RESULT ----
  renderProjectResult() {
    const r = State.projectResult;
    if (!r) return;
    const qualityClass = r.quality >= r.qualityTarget ? 'green' : 'warn';

    document.getElementById('scene-ProjectResult').innerHTML = `
      <div class="scene-container">
        <div class="result-card ${r.success ? 'result-success' : 'result-fail'}">
          <div class="result-banner">
            ${r.success ? '🎉 PROJECT SUCCESS' : '❌ PROJECT FAILED'}
          </div>
          <h2>${r.projectTitle}</h2>

          <div class="result-grid">
            <div class="result-stat">
              <span class="rs-label">Days Used</span>
              <span class="rs-val">${r.daysUsed} / ${r.deadline}</span>
            </div>
            <div class="result-stat">
              <span class="rs-label">Final Quality</span>
              <span class="rs-val ${qualityClass}">${r.quality} <small>(target: ${r.qualityTarget})</small></span>
            </div>
            <div class="result-stat">
              <span class="rs-label">Bugs Remaining</span>
              <span class="rs-val ${r.bugs > 5 ? 'danger' : 'green'}">${Math.ceil(r.bugs)}</span>
            </div>
            <div class="result-stat">
              <span class="rs-label">Income Earned</span>
              <span class="rs-val green">${fmt$(r.income)}</span>
            </div>
            ${r.budgetBonus ? `
              <div class="result-stat">
                <span class="rs-label">Budget Bonus</span>
                <span class="rs-val green">+${fmt$(r.budgetBonus)}</span>
              </div>` : ''}
            <div class="result-stat">
              <span class="rs-label">Reputation</span>
              <span class="rs-val ${r.repChange >= 0 ? 'green' : 'danger'}">
                ${r.repChange >= 0 ? '+' : ''}${r.repChange} → ${State.company.reputation}
              </span>
            </div>
          </div>

          ${!r.success ? `
            <div class="result-note">
              The project ran ${r.daysUsed - r.deadline} day(s) over deadline.
              You received 30% of the budget as a partial payment.
            </div>` : ''}

          <div class="result-actions">
            <button class="btn btn-primary btn-lg" onclick="GameManager.backToDashboard()">
              Back to Dashboard →
            </button>
          </div>
        </div>
      </div>`;
  },

  // ---- TUTORIAL ----
  renderTutorial() {
    if (!State.tutorial.active) return;
    const steps = [
      { scene: 'Dashboard', msg: 'Welcome! This is your <strong>Dashboard</strong>. Pick a project from the left to get started.', target: '.project-list' },
      { scene: 'ProjectDetail', msg: 'Review the project details — budget, deadline, and features. Click <strong>Accept Project</strong> when ready.', target: '.detail-actions' },
      { scene: 'TeamManagement', msg: 'Assign at least one <strong>Developer</strong> to the project. QA and Managers are optional but helpful.', target: '.emp-list' },
      { scene: 'ProjectSimulation', msg: 'Click <strong>Next Day</strong> to advance the simulation. Watch for events and manage your team!', target: '.sim-controls' }
    ];

    const step = steps.find(s => s.scene === State.scene);
    if (!step) return;

    const overlay = document.getElementById('tutorial-overlay');
    overlay.innerHTML = `
      <div class="tutorial-tip">
        <div class="tutorial-step">Tutorial</div>
        <p>${step.msg}</p>
        <button class="btn btn-sm" onclick="State.tutorial.step++; UI.renderTutorial()">Got it</button>
        <button class="btn btn-sm btn-ghost" onclick="State.tutorial.active=false; UI.renderTutorial()">Dismiss</button>
      </div>`;
  }
};

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  UI.render();
});
