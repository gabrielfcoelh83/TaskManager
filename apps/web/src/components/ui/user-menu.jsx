import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Icon } from '../../lib/icons';
import { iniciais } from '../../lib/perfil';
import styles from './user-menu-utils/user-menu.module.css';

// Menu da conta: o rosto (iniciais) de quem está logado abre um painel com
// nome, e-mail, alguns destinos e "Sair". Adaptado do UserMenu da Arc: sem
// status de presença nem troca claro/escuro (o app não tem nenhum dos dois),
// com os ícones de `lib/icons` e as cores da paleta escolhida (`cores`).
//
// - Abaixo de 640px abre como folha inferior (arrastar para baixo fecha).
// - Setas, Home/End e as iniciais de um item navegam; Esc e Tab fecham e
//   devolvem o foco ao gatilho.
// - `onSignOut` que devolve promessa mostra "Saindo…" no item e fecha quando
//   ela termina.
//
// props:
//   user        { name, email, plan?, avatarSrc? }
//   items       [{ label, icon (nome em lib/icons), keys?, onSelect, testId? }]
//   onSignOut   () => void | Promise
//   cores       { primary, primarySoft, primaryDark } — de `theme`
//   align       'start' | 'center' | 'end'
//   showName    nome e seta ao lado do rosto (na barra lateral aberta)
//   portal      false mantém o painel dentro do gatilho
//   open / defaultOpen / onOpenChange

const compactQuery = '(max-width: 639px)';
const subscribeCompact = (change) => {
  const query = window.matchMedia(compactQuery);
  query.addEventListener('change', change);
  return () => query.removeEventListener('change', change);
};
const subscribeNothing = () => () => {};

const enter = [0.16, 1, 0.3, 1];
const standard = [0.22, 1, 0.36, 1];
const exitEase = [0.4, 0, 1, 1];

// O painel cresce do gatilho numa mola sem quique; as linhas vêm um instante
// depois. Fechar é um fade curto.
const panelMotion = {
  closed: { opacity: 0, scale: 0.94 },
  open: {
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring', visualDuration: 0.3, bounce: 0,
      opacity: { duration: 0.14, ease: enter },
      delayChildren: 0.03, staggerChildren: 0.016,
    },
  },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.12, ease: exitEase } },
};
const sheetMotion = {
  closed: { y: '100%' },
  open: {
    y: 0,
    transition: { type: 'spring', visualDuration: 0.36, bounce: 0, delayChildren: 0.06, staggerChildren: 0.02 },
  },
  exit: { y: '100%', transition: { duration: 0.22, ease: exitEase } },
};
const stillMotion = {
  closed: { opacity: 0 },
  open: { opacity: 1, transition: { duration: 0.12 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};
const rowMotion = {
  closed: { opacity: 0, y: 3 },
  open: { opacity: 1, y: 0, transition: { duration: 0.2, ease: enter } },
};
const snappy = { type: 'spring', visualDuration: 0.26, bounce: 0.12 };

function Portrait({ user, testId }) {
  const [failed, setFailed] = useState();
  if (!user.avatarSrc || failed === user.avatarSrc) {
    return <span className={`${styles.portrait} ${styles.initials}`} data-testid={testId}>{iniciais(user.name, '·')}</span>;
  }
  return (
    <img
      className={styles.portrait} src={user.avatarSrc} srcSet={user.avatarSrcSet} alt=""
      decoding="async" draggable={false} onError={() => setFailed(user.avatarSrc)} data-testid={testId}
    />
  );
}

function Face({ user, size, testId }) {
  return (
    <span className={styles.face} data-size={size}>
      <Portrait user={user} testId={testId} />
    </span>
  );
}

// Texto que muda sobe de um leve desfoque enquanto o antigo sai por cima.
function Rise({ text, reduced }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={text}
        className={styles.rise}
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: '0.35em', filter: 'blur(2px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={
          reduced
            ? { opacity: 0, transition: { duration: 0 } }
            : { opacity: 0, y: '-0.35em', filter: 'blur(2px)', transition: { duration: 0.16, ease: standard } }
        }
        transition={reduced ? { duration: 0 } : { duration: 0.24, ease: enter }}
      >
        {text}
      </motion.span>
    </AnimatePresence>
  );
}

function Keys({ keys }) {
  return (
    <kbd className={styles.keys} aria-hidden="true">
      {keys.map((key, index) => <kbd key={`${key}-${index}`} className={styles.key}>{key}</kbd>)}
    </kbd>
  );
}

const ehElemento = (alvo) => alvo instanceof window.HTMLElement;
const getStops = (root) => Array.from(root?.querySelectorAll('[data-stop]') ?? []);
const focusStop = (stop) => stop?.focus({ preventScroll: true });

export function UserMenu({
  user,
  items = [],
  onSignOut,
  signOutKeys,
  cores,
  align = 'end',
  showName = false,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  portal = true,
  className,
  testId,
}) {
  const id = useId();
  const menuId = `${id}-menu`;
  const triggerId = `${id}-trigger`;
  const reduced = !!useReducedMotion();
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const compact = useSyncExternalStore(subscribeCompact, () => window.matchMedia(compactQuery).matches, () => false);
  const [innerOpen, setInnerOpen] = useState(defaultOpen);
  const [signingOut, setSigningOut] = useState(false);
  const [highlight, setHighlight] = useState(null);
  const open = openProp ?? innerOpen;
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const surfaceRef = useRef(null);
  const listRef = useRef(null);
  const reason = useRef(null);
  const typed = useRef({ text: '', timer: 0 });
  const mounted = useRef(true);
  const pending = useRef(false);
  const sheet = hydrated && compact;
  const inline = !portal && !sheet;

  const vars = cores
    ? { '--um-primary': cores.primary, '--um-primary-soft': cores.primarySoft, '--um-primary-dark': cores.primaryDark }
    : undefined;

  useEffect(() => {
    mounted.current = true;
    const current = typed.current;
    return () => {
      mounted.current = false;
      window.clearTimeout(current.timer);
    };
  }, []);

  function setOpen(next, why = null) {
    reason.current = next ? why : null;
    if (next) setSigningOut(pending.current);
    setHighlight(null);
    setInnerOpen(next);
    onOpenChange?.(next);
  }
  function close(returnFocus) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus({ preventScroll: true });
  }

  // O foco só entra quando a pessoa abriu o menu: um menu que já nasce aberto
  // não rouba o foco nem rola a página.
  useEffect(() => {
    if (!open) return undefined;
    const why = reason.current;
    reason.current = null;
    if (!why) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const stops = getStops(listRef.current);
      if (why === 'first') focusStop(stops[0]);
      else if (why === 'last') focusStop(stops[stops.length - 1]);
      else surfaceRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, sheet]);

  // O painel se posiciona junto ao gatilho e cresce a partir do rosto; vira
  // para cima quando não cabe embaixo (o caso do rodapé da barra lateral).
  useLayoutEffect(() => {
    if (!open || sheet) return undefined;
    const place = () => {
      const panel = surfaceRef.current;
      const trigger = triggerRef.current;
      if (!panel || !trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      let left;
      let top;
      if (inline) {
        const root = rootRef.current?.getBoundingClientRect();
        left = (root?.left ?? 0) + panel.offsetLeft;
        top = (root?.top ?? 0) + panel.offsetTop;
      } else {
        const wanted = align === 'start' ? rect.left : align === 'center' ? rect.left + rect.width / 2 - width / 2 : rect.right - width;
        left = Math.min(Math.max(12, wanted), window.innerWidth - width - 12);
        const below = rect.bottom + 8;
        top = below + height > window.innerHeight - 12 && rect.top - 8 - height > 12 ? rect.top - 8 - height : below;
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
      }
      const faceCenter = rect.left + Math.min(rect.width, 42) / 2;
      const originX = align === 'end' && rect.width > 42 ? rect.right - 21 - left : faceCenter - left;
      panel.style.setProperty('--origin-x', `${Math.min(Math.max(0, originX), width)}px`);
      panel.style.setProperty('--origin-y', top < rect.top ? `${height}px` : '0px');
    };
    place();
    if (inline) return undefined;
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, sheet, inline, align]);

  // Clique fora fecha o painel. A folha tem o próprio véu.
  useEffect(() => {
    if (!open || sheet) return undefined;
    const onPointerDown = (event) => {
      const target = event.target;
      if (surfaceRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      reason.current = null;
      setHighlight(null);
      setInnerOpen(false);
      onOpenChange?.(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, sheet, onOpenChange]);

  // A página atrás da folha não rola.
  useEffect(() => {
    if (!open || !sheet) return undefined;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => { root.style.overflow = previous; };
  }, [open, sheet]);

  function signOut() {
    if (pending.current) return;
    const result = onSignOut?.();
    if (!result || typeof result.then !== 'function') {
      close(false);
      return;
    }
    pending.current = true;
    setSigningOut(true);
    const done = () => {
      pending.current = false;
      if (mounted.current) close(false);
    };
    result.then(done, done);
  }

  function onListFocus(event) {
    const stop = ehElemento(event.target) ? event.target.closest('[data-stop]') : null;
    if (!stop) {
      setHighlight(null);
      return;
    }
    setHighlight((current) => ({ top: stop.offsetTop, height: stop.offsetHeight, tone: stop.dataset.tone, glide: current !== null }));
  }

  // O foco segue o mouse, então o teclado continua de onde o ponteiro parou.
  function onItemPointerMove(event) {
    if (event.pointerType === 'touch') return;
    if (document.activeElement !== event.currentTarget) event.currentTarget.focus({ preventScroll: true });
  }
  function onListPointerLeave(event) {
    if (event.pointerType === 'touch') return;
    setHighlight(null);
    surfaceRef.current?.focus({ preventScroll: true });
  }

  function onKeyDown(event) {
    const stops = getStops(listRef.current);
    const active = ehElemento(document.activeElement) ? document.activeElement : null;
    const current = active?.closest('[data-stop]') ?? null;
    const index = current ? stops.indexOf(current) : -1;
    const step = (to) => {
      event.preventDefault();
      focusStop(to);
    };
    switch (event.key) {
      case 'ArrowDown': return step(stops[(index + 1) % stops.length]);
      case 'ArrowUp': return step(stops[index <= 0 ? stops.length - 1 : index - 1]);
      case 'Home': return step(stops[0]);
      case 'End': return step(stops[stops.length - 1]);
      case 'Escape':
      case 'Tab':
        event.preventDefault();
        return close(true);
      default:
    }
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey || event.key === ' ') return;
    // Busca por digitação: letras pulam para o próximo item que começa com elas.
    const memory = typed.current;
    window.clearTimeout(memory.timer);
    memory.text += event.key.toLowerCase();
    memory.timer = window.setTimeout(() => { memory.text = ''; }, 500);
    const ordered = [...stops.slice(index + 1), ...stops.slice(0, index + 1)];
    const search = memory.text.length > 1 && current?.dataset.label?.toLowerCase().startsWith(memory.text) ? [current] : ordered;
    const match = search.find((stop) => stop.dataset.label?.toLowerCase().startsWith(memory.text));
    if (match) step(match);
  }

  function onTriggerClick(event) {
    if (open) {
      close(false);
      return;
    }
    setOpen(true, event.detail === 0 ? 'first' : 'pointer');
  }
  function onTriggerKeyDown(event) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    setOpen(true, event.key === 'ArrowDown' ? 'first' : 'last');
  }

  function onDragEnd(_, info) {
    if (info.offset.y > 80 || info.velocity.y > 500) close(true);
  }

  const glide = highlight?.glide && !reduced ? snappy : { duration: 0 };
  const row = reduced ? undefined : rowMotion;
  const menuProps = { id: menuId, role: 'menu', 'aria-labelledby': triggerId, tabIndex: -1, onKeyDown };

  const content = (
    <>
      <motion.div className={styles.header} variants={row}>
        <Face user={user} size="md" />
        <div className={styles.identity}>
          <div className={styles.nameRow}>
            <span className={styles.name}>{user.name || 'Sem nome'}</span>
            {user.plan && <span className={styles.plan}>{user.plan}</span>}
          </div>
          {user.email && <span className={styles.email} title={user.email}>{user.email}</span>}
        </div>
      </motion.div>
      <div ref={listRef} className={styles.list} onFocus={onListFocus} onPointerLeave={onListPointerLeave}>
        <motion.span
          className={styles.highlight}
          data-tone={highlight?.tone}
          aria-hidden="true"
          initial={false}
          animate={highlight ? { y: highlight.top, height: highlight.height, opacity: 1 } : { opacity: 0 }}
          transition={{ default: glide, opacity: { duration: reduced ? 0 : 0.1 } }}
        />
        {items.length > 0 && (
          <>
            <div className={styles.separator} role="separator" />
            {items.map((item) => (
              <motion.button
                key={item.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={styles.item}
                data-stop="item"
                data-label={item.label}
                data-testid={item.testId}
                variants={row}
                onPointerMove={onItemPointerMove}
                onClick={() => {
                  close(true);
                  item.onSelect?.();
                }}
              >
                <span className={styles.icon} aria-hidden="true">
                  {item.icon && <Icon name={item.icon} size={16} />}
                </span>
                <span className={styles.itemLabel}>{item.label}</span>
                {item.keys && <Keys keys={item.keys} />}
              </motion.button>
            ))}
          </>
        )}
        <div className={styles.separator} role="separator" />
        <motion.button
          type="button"
          role="menuitem"
          tabIndex={-1}
          className={styles.item}
          data-stop="item"
          data-tone="danger"
          data-label="Sair"
          data-testid="sair"
          variants={row}
          aria-busy={signingOut || undefined}
          onPointerMove={onItemPointerMove}
          onClick={signOut}
        >
          <span className={styles.icon} aria-hidden="true">
            {signingOut
              ? <span className={styles.spinner} style={{ display: 'inline-flex' }}><Icon name="loader-circle" size={16} /></span>
              : <Icon name="log-out" size={16} />}
          </span>
          <span className={styles.itemLabel}>
            <Rise text={signingOut ? 'Saindo…' : 'Sair'} reduced={reduced} />
          </span>
          {signOutKeys && <Keys keys={signOutKeys} />}
        </motion.button>
      </div>
    </>
  );

  const panel = (
    <AnimatePresence>
      {open && !sheet && (
        <motion.div
          key="panel"
          ref={surfaceRef}
          {...menuProps}
          className={styles.panel}
          style={vars}
          data-inline={inline || undefined}
          data-align={align}
          variants={reduced ? stillMotion : panelMotion}
          initial="closed"
          animate="open"
          exit="exit"
        >
          {content}
        </motion.div>
      )}
    </AnimatePresence>
  );

  const bottomSheet = (
    <AnimatePresence>
      {open && sheet && (
        <motion.div
          key="scrim"
          className={styles.scrim}
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0.1 : 0.2, ease: standard }}
          onClick={() => close(true)}
        />
      )}
      {open && sheet && (
        <motion.div
          key="sheet"
          ref={surfaceRef}
          {...menuProps}
          className={`${styles.panel} ${styles.sheet}`}
          style={vars}
          aria-modal="true"
          variants={reduced ? stillMotion : sheetMotion}
          initial="closed"
          animate="open"
          exit="exit"
          drag={reduced ? false : 'y'}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.04, bottom: 0.9 }}
          dragMomentum={false}
          onDragEnd={onDragEnd}
        >
          <span className={styles.handle} aria-hidden="true" />
          {content}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <span ref={rootRef} className={styles.root} style={{ ...vars, width: showName ? '100%' : undefined }}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={[styles.trigger, className].filter(Boolean).join(' ')}
        data-state={open ? 'open' : 'closed'}
        data-name={showName || undefined}
        data-testid={testId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Menu da conta${user.name ? `, ${user.name}` : ''}`}
        title={showName ? undefined : user.name || undefined}
        onClick={onTriggerClick}
        onKeyDown={onTriggerKeyDown}
      >
        <Face user={user} size="sm" testId="avatar" />
        {showName && (
          <>
            <span className={styles.triggerName} data-testid="perfil-nome">{user.name || 'Sem nome'}</span>
            <span className={styles.chevron} style={{ display: 'inline-flex' }} aria-hidden="true">
              <Icon name="chevron-down" size={15} />
            </span>
          </>
        )}
      </button>
      {sheet
        ? createPortal(bottomSheet, document.body)
        : inline
          ? panel
          : hydrated
            ? createPortal(panel, document.body)
            : null}
    </span>
  );
}

export default UserMenu;
