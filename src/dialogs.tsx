import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { api, Collection, Host, KeyInfo, newId } from "./api";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Only the top-most sheet reacts to Escape (sheets can stack).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const all = document.querySelectorAll(".overlay");
      if (all[all.length - 1] === ref.current) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay" ref={ref} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="form-row">
      <span className="form-label">{label}</span>
      <span className="form-control">
        {children}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

function Actions({ onClose, busy, submit = "Save" }: { onClose: () => void; busy?: boolean; submit?: string }) {
  return (
    <div className="actions">
      <button type="button" className="btn" onClick={onClose}>
        Cancel
      </button>
      <button type="submit" className="btn primary" disabled={busy}>
        {submit}
      </button>
    </div>
  );
}

export function HostDialog({
  host,
  defaultCollection,
  collections,
  keys,
  onKeyAdded,
  onSave,
  onClose,
}: {
  host?: Host;
  defaultCollection?: string | null;
  collections: Collection[];
  keys: KeyInfo[];
  onKeyAdded: (k: KeyInfo) => void;
  onSave: (h: Host) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(host?.name ?? "");
  const [address, setAddress] = useState(host?.address ?? "");
  const [port, setPort] = useState(String(host?.port ?? 22));
  const [username, setUsername] = useState(host?.username ?? "");
  const [collectionId, setCollectionId] = useState(host ? (host.collectionId ?? "") : (defaultCollection ?? ""));
  const [auth, setAuth] = useState<Host["auth"]>(host?.auth ?? "password");
  const [keyId, setKeyId] = useState(host?.keyId ?? keys[0]?.id ?? "");
  const [password, setPassword] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [addingKey, setAddingKey] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (host) api.hostHasPassword(host.id).then(setHasPassword).catch(() => {});
  }, [host]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const p = Number(port);
    if (!Number.isInteger(p) || p < 1 || p > 65535) return setError("Port must be between 1 and 65535.");
    if (auth === "key" && !keyId) return setError("Select a key or add a new one.");
    const h: Host = {
      id: host?.id ?? newId(),
      name: name.trim() || address.trim(),
      address: address.trim(),
      port: p,
      username: username.trim(),
      auth,
      keyId: auth === "key" ? keyId : null,
      collectionId: collectionId || null,
    };
    try {
      await onSave(h);
      if (auth === "password" && password) await api.hostSetPassword(h.id, password);
      onClose();
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <Modal title={host ? "Edit host" : "New host"} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-group">
          <Row label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="production" autoFocus />
          </Row>
          <Row label="Address">
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="192.168.0.10" required />
          </Row>
          <Row label="Port">
            <input value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" className="narrow" />
          </Row>
          <Row label="Collection">
            <select value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
              <option value="">None</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Row>
        </div>

        <div className="form-group">
          <Row label="User">
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="root" required />
          </Row>
          <Row label="Auth">
            <div className="segmented">
              <button type="button" className={auth === "password" ? "on" : ""} onClick={() => setAuth("password")}>
                Password
              </button>
              <button type="button" className={auth === "key" ? "on" : ""} onClick={() => setAuth("key")}>
                SSH key
              </button>
            </div>
          </Row>
          {auth === "password" ? (
            <Row label="Password" hint="Leave empty to be asked on every connect.">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={hasPassword ? "Saved" : "Optional"}
              />
            </Row>
          ) : (
            <Row label="Key">
              <span className="inline">
                <select value={keyId} onChange={(e) => setKeyId(e.target.value)}>
                  {keys.length === 0 && <option value="">No keys</option>}
                  {keys.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn small" onClick={() => setAddingKey(true)}>
                  Add…
                </button>
              </span>
            </Row>
          )}
        </div>

        {host && (
          <div className="inline-links">
            {hasPassword && (
              <button
                type="button"
                className="link"
                onClick={() =>
                  api.hostSetPassword(host.id, null).then(() => {
                    setHasPassword(false);
                    setNote("Saved password removed.");
                  })
                }
              >
                Remove saved password
              </button>
            )}
            <button
              type="button"
              className="link"
              onClick={() => api.hostForgetKey(host.id).then(() => setNote("Server fingerprint forgotten."))}
            >
              Reset server fingerprint
            </button>
          </div>
        )}
        {note && <p className="note">{note}</p>}
        {error && <p className="error">{error}</p>}
        <Actions onClose={onClose} />
      </form>
      {addingKey && (
        <KeyDialog
          onDone={(k) => {
            onKeyAdded(k);
            setKeyId(k.id);
          }}
          onClose={() => setAddingKey(false)}
        />
      )}
    </Modal>
  );
}

export function KeyDialog({ onDone, onClose }: { onDone: (k: KeyInfo) => void; onClose: () => void }) {
  const [mode, setMode] = useState<"generate" | "import">("generate");
  const [name, setName] = useState("");
  const [pem, setPem] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const label = name.trim() || "My key";
      const key =
        mode === "generate"
          ? await api.keyGenerate(label)
          : await api.keyImport(label, pem, passphrase || null);
      onDone(key);
      onClose();
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  };

  return (
    <Modal title="Add SSH key" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="segmented wide">
          <button type="button" className={mode === "generate" ? "on" : ""} onClick={() => setMode("generate")}>
            Generate
          </button>
          <button type="button" className={mode === "import" ? "on" : ""} onClick={() => setMode("import")}>
            Import
          </button>
        </div>
        <div className="form-group">
          <Row label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="work" autoFocus />
          </Row>
          {mode === "import" && (
            <>
              <Row label="File">
                <input
                  type="file"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setPem(await f.text());
                      if (!name) setName(f.name);
                    }
                  }}
                />
              </Row>
              <Row label="Passphrase" hint="Only needed if the key is passphrase-protected.">
                <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
              </Row>
            </>
          )}
        </div>
        {mode === "import" && (
          <textarea
            value={pem}
            onChange={(e) => setPem(e.target.value)}
            rows={5}
            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
            spellCheck={false}
            required
          />
        )}
        {mode === "generate" && <p className="muted">Creates a new Ed25519 key. Afterwards, add its public key to the server's authorized_keys.</p>}
        {error && <p className="error">{error}</p>}
        <Actions onClose={onClose} busy={busy} submit={mode === "generate" ? "Generate" : "Import"} />
      </form>
    </Modal>
  );
}
