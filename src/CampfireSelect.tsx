import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

import "./CampfireSelect.css";

export type CampfireSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type Props = {
  value: string;
  options: readonly CampfireSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
};

type MenuPosition = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

function firstEnabledIndex(options: readonly CampfireSelectOption[]): number {
  return options.findIndex((option) => !option.disabled);
}

function lastEnabledIndex(options: readonly CampfireSelectOption[]): number {
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (!options[index]?.disabled) {
      return index;
    }
  }

  return -1;
}

function nextEnabledIndex(
  options: readonly CampfireSelectOption[],
  current: number,
  direction: 1 | -1
): number {
  if (options.length === 0) {
    return -1;
  }

  let index = current;

  for (let attempts = 0; attempts < options.length; attempts += 1) {
    index = (index + direction + options.length) % options.length;

    if (!options[index]?.disabled) {
      return index;
    }
  }

  return current;
}

export default function CampfireSelect({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  className = "",
}: Props) {
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [blackPiano, setBlackPiano] = useState(false);
  const [position, setPosition] = useState<MenuPosition>({
    left: 0,
    top: 0,
    width: 220,
    maxHeight: 280,
  });

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const selectedLabel = selectedOption?.label ?? options[0]?.label ?? "Selecionar";

  function updatePosition() {
    const trigger = triggerRef.current;

    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const below = Math.max(0, viewportHeight - rect.bottom - margin - gap);
    const above = Math.max(0, rect.top - margin - gap);
    const openUpward = below < 150 && above > below;
    const maxHeight = Math.max(96, Math.min(280, openUpward ? above : below));
    const width = Math.max(rect.width, 180);
    const left = Math.min(
      Math.max(margin, rect.left),
      Math.max(margin, viewportWidth - width - margin)
    );
    const top = openUpward
      ? Math.max(margin, rect.top - gap - maxHeight)
      : Math.min(viewportHeight - margin - 96, rect.bottom + gap);

    setBlackPiano(Boolean(trigger.closest(".blackPianoTheme")));
    setPosition({ left, top, width, maxHeight });
  }

  function closeMenu(restoreFocus = false) {
    setOpen(false);

    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }

  function openMenu(preferredIndex = selectedIndex) {
    if (disabled || options.length === 0) {
      return;
    }

    let nextIndex = preferredIndex;

    if (nextIndex < 0 || options[nextIndex]?.disabled) {
      nextIndex = firstEnabledIndex(options);
    }

    setActiveIndex(nextIndex);
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];

    if (!option || option.disabled) {
      return;
    }

    if (option.value !== value) {
      onChange(option.value);
    }

    closeMenu(true);
  }

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    updatePosition();

    const onViewportChange = () => updatePosition();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);

    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (
        target &&
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        closeMenu(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || activeIndex < 0) {
      return;
    }

    window.requestAnimationFrame(() => {
      optionRefs.current[activeIndex]?.focus();
    });
  }, [open, activeIndex]);

  useEffect(() => {
    if (disabled && open) {
      closeMenu(false);
    }
  }, [disabled, open]);

  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(options));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(selectedIndex >= 0 ? selectedIndex : lastEnabledIndex(options));
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      openMenu(firstEnabledIndex(options));
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      openMenu(lastEnabledIndex(options));
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open ? closeMenu(false) : openMenu();
      return;
    }

    if (event.key === "Escape" && open) {
      event.preventDefault();
      closeMenu(false);
    }
  }

  function onOptionKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number
  ) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(nextEnabledIndex(options, index, 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(nextEnabledIndex(options, index, -1));
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(firstEnabledIndex(options));
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(lastEnabledIndex(options));
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(index);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
      return;
    }

    if (event.key === "Tab") {
      closeMenu(false);
    }
  }

  return (
    <div className={["campfireSelect", className].filter(Boolean).join(" ")}>
      <button
        ref={triggerRef}
        type="button"
        className="campfireSelectTrigger"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        disabled={disabled}
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="campfireSelectValue">{selectedLabel}</span>
        <span className="campfireSelectChevron" aria-hidden="true">⌄</span>
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              id={listboxId}
              className={[
                "campfireSelectMenu",
                blackPiano ? "isBlackPiano" : "",
              ].filter(Boolean).join(" ")}
              role="listbox"
              aria-label={ariaLabel}
              style={{
                left: `${position.left}px`,
                top: `${position.top}px`,
                width: `${position.width}px`,
                maxHeight: `${position.maxHeight}px`,
              }}
            >
              {options.map((option, index) => (
                <button
                  key={`${option.value}-${index}`}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  type="button"
                  className="campfireSelectOption"
                  role="option"
                  aria-selected={option.value === value}
                  disabled={option.disabled}
                  tabIndex={index === activeIndex ? 0 : -1}
                  onMouseEnter={() => {
                    if (!option.disabled) {
                      setActiveIndex(index);
                    }
                  }}
                  onClick={() => choose(index)}
                  onKeyDown={(event) => onOptionKeyDown(event, index)}
                >
                  <span>{option.label}</span>
                  {option.value === value ? (
                    <span className="campfireSelectCheck" aria-hidden="true">✓</span>
                  ) : null}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
