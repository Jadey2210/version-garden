(() => {
  const byId = (id) => document.getElementById(id);
  const authModal = byId("loginModal");
  const authForm = byId("authForm");
  const authStatus = byId("authStatus");
  const modeButton = byId("authModeToggle");
  const submitButton = byId("authSubmit");
  const passwordInput = byId("authPassword");
  let mode = "signin";
  let client = null;
  let activeUser = null;
  let cloudTimer = null;
  let authReady = false;
  let loadedUserId = null;

  const configured = () => /^https:\/\//.test(window.VERSION_GARDEN_SUPABASE_URL || "") &&
    !String(window.VERSION_GARDEN_SUPABASE_URL).includes("YOUR_") &&
    Boolean(window.VERSION_GARDEN_SUPABASE_ANON_KEY) &&
    !String(window.VERSION_GARDEN_SUPABASE_ANON_KEY).includes("YOUR_");

  function setStatus(message, kind = "info") {
    authStatus.textContent = message;
    authStatus.dataset.kind = kind;
    authStatus.hidden = false;
  }

  function setMode(next) {
    mode = next;
    byId("authTitle").textContent = mode === "signup" ? "Create your free account" : "Welcome back";
    byId("authIntro").textContent = mode === "signup"
      ? "Sign up with your email to keep your notebook synced across devices."
      : "Sign in to open your saved notebook on this device.";
    submitButton.textContent = mode === "signup" ? "Create account" : "Sign in";
    modeButton.textContent = mode === "signup" ? "I already have an account · Sign in" : "New here? Create an account";
    passwordInput.autocomplete = mode === "signup" ? "new-password" : "current-password";
    passwordInput.minLength = mode === "signup" ? 8 : 1;
    authStatus.hidden = true;
    if (!client) setStatus("Add your Supabase project URL and public anon key to config.js, then run account-setup.md. Open registration will be enabled for all visitors after setup.", "setup");
  }

  function showAccount(user) {
    activeUser = user || null;
    const button = byId("loginBtn");
    if (activeUser) {
      button.textContent = "Account";
      button.title = activeUser.email || "Signed in";
      byId("authForms").hidden = true;
      byId("signedInPanel").hidden = false;
      byId("signedInEmail").textContent = activeUser.email || "Your account";
      byId("authIntro").textContent = "Your notebooks sync securely to your account.";
    } else {
      button.textContent = "Sign in";
      button.title = "Sign in or create a free account";
      byId("authForms").hidden = false;
      byId("signedInPanel").hidden = true;
      setMode("signin");
    }
  }

  async function uploadNotebook() {
    if (!client || !activeUser || !window.versionGarden) return;
    const data = window.versionGarden.getModel();
    const { error } = await client.from("user_notebooks").upsert({
      user_id: activeUser.id,
      data,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) {
      setStatus("Your changes are saved on this device. Cloud sync needs attention: " + error.message, "error");
      return;
    }
    const saveLabel = byId("saveState");
    if (saveLabel) saveLabel.textContent = "Synced to your account";
  }

  function scheduleCloudSave() {
    if (!activeUser || !client) return;
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(uploadNotebook, 700);
  }

  async function loadNotebook(user) {
    const { data, error } = await client.from("user_notebooks")
      .select("data").eq("user_id", user.id).maybeSingle();
    if (error) {
      setStatus("You are signed in, but your notebook could not be loaded: " + error.message, "error");
      return;
    }
    if (data?.data?.pages?.length) {
      window.versionGarden.setModel(data.data);
      localStorage.setItem("versebook", JSON.stringify(data.data));
    } else {
      await uploadNotebook();
    }
    loadedUserId = user.id;
    const saveLabel = byId("saveState");
    if (saveLabel) saveLabel.textContent = "Synced to your account";
  }

  async function acceptSession(session) {
    const nextUser = session?.user || null;
    if (nextUser?.id === activeUser?.id) {
      if (nextUser && authReady && loadedUserId !== nextUser.id) await loadNotebook(nextUser);
      return;
    }
    if (!nextUser && activeUser) {
      activeUser = null;
      loadedUserId = null;
      localStorage.removeItem("versebook");
      location.reload();
      return;
    }
    showAccount(nextUser);
    if (nextUser && authReady) await loadNotebook(nextUser);
  }

  byId("loginBtn").addEventListener("click", () => {
    authModal.classList.add("open");
    if (!activeUser) byId("authEmail").focus();
    else byId("signOutBtn").focus();
  });
  byId("loginClose").addEventListener("click", () => authModal.classList.remove("open"));
  authModal.addEventListener("click", (event) => {
    if (event.target === authModal) authModal.classList.remove("open");
  });
  modeButton.addEventListener("click", () => setMode(mode === "signup" ? "signin" : "signup"));
  byId("signOutBtn").addEventListener("click", async () => {
    const { error } = await client.auth.signOut();
    if (error) setStatus("Could not sign out: " + error.message, "error");
    else authModal.classList.remove("open");
  });
  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client) {
      setStatus("Account sign-in is not connected yet. Add the Supabase project URL and public anon key to config.js, then run the setup SQL in account-setup.md.", "error");
      return;
    }
    submitButton.disabled = true;
    submitButton.textContent = mode === "signup" ? "Creating account…" : "Signing in…";
    const email = byId("authEmail").value.trim();
    const password = passwordInput.value;
    const result = mode === "signup"
      ? await client.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } })
      : await client.auth.signInWithPassword({ email, password });
    submitButton.disabled = false;
    submitButton.textContent = mode === "signup" ? "Create account" : "Sign in";
    if (result.error) {
      setStatus(result.error.message, "error");
      return;
    }
    if (mode === "signup" && !result.data.session) {
      setStatus("Account created. Check your email for the confirmation link, then come back here to sign in.", "success");
      authForm.reset();
      return;
    }
    authForm.reset();
    setStatus(mode === "signup" ? "Account created. Your notebook is syncing." : "Signed in. Loading your notebook…", "success");
    await acceptSession(result.data.session);
    if (activeUser) setTimeout(() => authModal.classList.remove("open"), 900);
  });

  window.addEventListener("version-garden-save", scheduleCloudSave);
  if (configured() && window.supabase?.createClient) {
    client = window.supabase.createClient(window.VERSION_GARDEN_SUPABASE_URL, window.VERSION_GARDEN_SUPABASE_ANON_KEY);
    client.auth.onAuthStateChange((_event, session) => { void acceptSession(session); });
    client.auth.getSession().then(({ data }) => {
      authReady = true;
      void acceptSession(data.session);
    });
  }
  setMode("signin");
  showAccount(null);
})();

