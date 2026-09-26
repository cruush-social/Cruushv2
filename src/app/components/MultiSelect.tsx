import type { CSSProperties } from 'react';
import { DROPDOWN_TRIGGER_CLASS } from '../lib/controlStyles';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Badge } from './ui/badge';
import { Check, Search, X } from 'lucide-react';

export type MultiSelectOptionGroup = {
  label: string;
  options: string[];
};

const MENU_MAX_HEIGHT = 288;
const MENU_MIN_HEIGHT = 96;
const MENU_OFFSET = 8;
const MENU_VIEWPORT_PADDING = 16;
const MENU_FLIP_THRESHOLD = 220;
const MENU_MOBILE_BREAKPOINT = 640;
const MENU_PORTAL_Z_INDEX = 120;
const MENU_OPTION_HEIGHT_ESTIMATE = 36;
const MULTI_SELECT_OPEN_EVENT = 'cruush:multiselect-open';
const TOUCH_SCROLL_STYLE: CSSProperties = {
  WebkitOverflowScrolling: 'touch',
  touchAction: 'pan-y',
};
const HORIZONTAL_TOUCH_SCROLL_STYLE: CSSProperties = {
  WebkitOverflowScrolling: 'touch',
  touchAction: 'pan-x pan-y',
};

type ResolvedMenuPlacement = 'bottom' | 'top';

interface MultiSelectProps {
  options?: string[];
  optionGroups?: MultiSelectOptionGroup[];
  value?: string[];
  onChange?: (value: string[]) => void;
  selectionMode?: 'multiple' | 'single';
  ariaLabel?: string;
  placeholder?: string;
  menuPlacement?: 'bottom' | 'top';
  menuPortal?: boolean;
  disableAddingOptions?: boolean;
  onAddingDisabled?: () => void;
  maxSelections?: number;
  searchable?: boolean;
}
export default function MultiSelect({
  options = [],
  optionGroups,
  value = [],
  onChange,
  selectionMode = 'multiple',
  ariaLabel,
  placeholder = 'Select options...',
  menuPlacement = 'bottom',
  menuPortal = false,
  disableAddingOptions = false,
  onAddingDisabled,
  maxSelections,
  searchable = false,
}: MultiSelectProps) {
  const [selected, setSelected] = useState<string[]>(value);
  const [isOpen, setIsOpen] = useState(false);
  const instanceId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const portalMenuRef = useRef<HTMLDivElement | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [resolvedMenuPlacement, setResolvedMenuPlacement] = useState<ResolvedMenuPlacement>(menuPlacement);
  const [localMenuStyle, setLocalMenuStyle] = useState<CSSProperties | null>(null);
  const [portalStyle, setPortalStyle] = useState<CSSProperties | null>(null);
  const groups = useMemo(() => optionGroups ?? [{ label: '', options }], [optionGroups, options]);
  const hasCategoryPicker = Boolean(optionGroups?.length && optionGroups.length > 1);
  const menuNeedsDefiniteHeight = hasCategoryPicker || groups.reduce((total, group) => total + group.options.length, 0) * MENU_OPTION_HEIGHT_ESTIMATE > MENU_MAX_HEIGHT;
  const [activeGroupLabel, setActiveGroupLabel] = useState(groups[0]?.label ?? '');
  const [searchQuery, setSearchQuery] = useState('');
  const activeGroup = groups.find((group) => group.label === activeGroupLabel) ?? groups[0] ?? { label: '', options: [] };
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const searchGroups = normalizedSearchQuery
    ? groups.map((group) => ({
        ...group,
        options: group.options.filter((option) => option.toLowerCase().includes(normalizedSearchQuery)),
      })).filter((group) => group.options.length > 0)
    : [];
  const tablistRef = useRef<HTMLDivElement | null>(null);
  const touchDragState = useRef({ isDown: false, startX: 0, scrollLeft: 0 });

  const handleTablistTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (tablistRef.current && e.touches.length === 1) {
      touchDragState.current = {
        isDown: true,
        startX: e.touches[0].clientX,
        scrollLeft: tablistRef.current.scrollLeft,
      };
    }
  };

  const handleTablistTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchDragState.current.isDown && tablistRef.current && e.touches.length === 1) {
      const walk = (e.touches[0].clientX - touchDragState.current.startX) * 1.25;
      tablistRef.current.scrollLeft = touchDragState.current.scrollLeft - walk;
    }
  };

  const handleTablistTouchEnd = () => {
    touchDragState.current.isDown = false;
  };

  useEffect(() => {
    setSelected(value);
  }, [value]);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!groups.some((group) => group.label === activeGroupLabel)) {
      setActiveGroupLabel(groups[0]?.label ?? '');
    }
  }, [activeGroupLabel, groups]);

  useEffect(() => {
    const closeWhenAnotherSelectOpens = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== instanceId) {
        setIsOpen(false);
      }
    };

    window.addEventListener(MULTI_SELECT_OPEN_EVENT, closeWhenAnotherSelectOpens);

    return () => {
      window.removeEventListener(MULTI_SELECT_OPEN_EVENT, closeWhenAnotherSelectOpens);
    };
  }, [instanceId]);

  const toggleMenu = () => {
    const nextOpen = !isOpen;
    if (nextOpen) {
      window.dispatchEvent(new CustomEvent(MULTI_SELECT_OPEN_EVENT, { detail: instanceId }));
    }
    setIsOpen(nextOpen);
  };

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) {
      setResolvedMenuPlacement(menuPlacement);
      setLocalMenuStyle(null);
      setPortalStyle(null);
      setPortalRoot(null);
      return;
    }

    const updatePortalStyle = () => {
      if (!triggerRef.current) {
        return;
      }

      const rect = triggerRef.current.getBoundingClientRect();
      const ownerDocument = triggerRef.current.ownerDocument;
      const modalContent = triggerRef.current.closest<HTMLElement>('[data-slot="sheet-content"], [data-slot="dialog-content"]');
      const bottomSpace = window.innerHeight - rect.bottom - MENU_VIEWPORT_PADDING - MENU_OFFSET;
      const topSpace = rect.top - MENU_VIEWPORT_PADDING - MENU_OFFSET;
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const useMobileSheetWidth = viewportWidth < MENU_MOBILE_BREAKPOINT;
      const placeAbove = menuPlacement === 'top' || (
        menuPlacement === 'bottom' &&
        topSpace > bottomSpace &&
        (
          bottomSpace < MENU_FLIP_THRESHOLD ||
          (menuPortal && useMobileSheetWidth && bottomSpace < MENU_MAX_HEIGHT)
        )
      );
      const availableHeight = Math.max(0, placeAbove ? topSpace : bottomSpace);
      const maxHeight = Math.max(MENU_MIN_HEIGHT, Math.min(MENU_MAX_HEIGHT, availableHeight));
      setResolvedMenuPlacement(placeAbove ? 'top' : 'bottom');
      // A max-height does not establish a definite height for the desktop
      // category picker. Its h-full children then expand to their content
      // instead of making their own options panes scrollable.
      const menuHeight = menuNeedsDefiniteHeight ? { height: maxHeight } : { maxHeight };
      setLocalMenuStyle(menuPortal ? null : menuHeight);
      // Radix locks touch scrolling outside modal content. Keep fixed portal
      // geometry while mounting the menu inside that allowed scroll boundary.
      setPortalRoot(menuPortal ? modalContent ?? ownerDocument.body : null);

      if (!menuPortal) {
        setPortalStyle(null);
        return;
      }

      const availableWidth = Math.max(0, viewportWidth - MENU_VIEWPORT_PADDING * 2);
      const targetWidth = hasCategoryPicker
        ? (useMobileSheetWidth ? availableWidth : Math.max(rect.width, Math.min(availableWidth, 480)))
        : rect.width;
      const width = useMobileSheetWidth ? availableWidth : Math.min(targetWidth, availableWidth);
      const left = useMobileSheetWidth
        ? MENU_VIEWPORT_PADDING
        : Math.min(
            Math.max(MENU_VIEWPORT_PADDING, rect.left),
            Math.max(MENU_VIEWPORT_PADDING, viewportWidth - width - MENU_VIEWPORT_PADDING),
          );

      setPortalStyle(placeAbove
        ? {
            bottom: window.innerHeight - rect.top + MENU_OFFSET,
            left,
            ...menuHeight,
            position: 'fixed',
            width,
          }
        : {
            left,
            ...menuHeight,
            position: 'fixed',
            top: rect.bottom + MENU_OFFSET,
            width,
          });
    };

    updatePortalStyle();
    window.addEventListener('resize', updatePortalStyle);
    window.addEventListener('scroll', updatePortalStyle, true);

    // Scroll and resize alone miss layout shifts that move the trigger while
    // the menu is open, which desyncs a portalled menu from its anchor.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePortalStyle);
    if (observer && triggerRef.current) {
      observer.observe(triggerRef.current);
      if (triggerRef.current.offsetParent instanceof Element) {
        observer.observe(triggerRef.current.offsetParent);
      }
    }

    return () => {
      window.removeEventListener('resize', updatePortalStyle);
      window.removeEventListener('scroll', updatePortalStyle, true);
      observer?.disconnect();
    };
  }, [hasCategoryPicker, isOpen, menuNeedsDefiniteHeight, menuPlacement, menuPortal, selected.length]);

  useEffect(() => {
    if (!isOpen || !menuPortal) {
      return;
    }

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;

      if (!target || triggerRef.current?.contains(target) || portalMenuRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointerDown, true);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointerDown, true);
    };
  }, [isOpen, menuPortal]);

  const toggleOption = (option: string) => {
    if (selectionMode === 'multiple' && disableAddingOptions && !selected.includes(option)) {
      onAddingDisabled?.();
      return;
    }

    const newSelected = selectionMode === 'single'
      ? selected.includes(option) ? [] : [option]
      : selected.includes(option)
        ? selected.filter((s) => s !== option)
        : maxSelections && selected.length >= maxSelections
          ? [...selected.slice(1), option]
          : [...selected, option];
    setSelected(newSelected);
    onChange?.(newSelected);
    if (selectionMode === 'single') {
      setIsOpen(false);
    }
  };

  const removeOption = (option: string) => {
    const newSelected = selected.filter((s) => s !== option);
    setSelected(newSelected);
    onChange?.(newSelected);
  };

  const searchInput = searchable ? (
        <label className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            aria-label={`Search ${ariaLabel ?? 'options'}`}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search"
            type="search"
            value={searchQuery}
          />
        </label>
      ) : null;

  const flatMenuContent = (
    <div role="listbox" aria-label={ariaLabel} className={`scrollbar-subtle min-h-0 max-h-[inherit] overflow-y-auto${searchable ? ' flex-1' : ''}`} style={menuNeedsDefiniteHeight ? { ...TOUCH_SCROLL_STYLE, height: '100%' } : TOUCH_SCROLL_STYLE}>
      {(normalizedSearchQuery ? searchGroups : groups).map((group) => (
        <div key={group.label || 'options'} role={group.label ? 'group' : undefined} aria-label={group.label || undefined}>
          {group.label ? (
            <div className="sticky top-0 bg-popover px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {group.label}
            </div>
          ) : null}
          {group.options.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={selected.includes(option)}
              onClick={() => toggleOption(option)}
              className={`w-full px-4 py-2 text-left text-sm hover:bg-accent transition-colors ${
                selected.includes(option) ? 'bg-accent text-accent-foreground' : ''
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      ))}
    </div>
  );

  const menuContent = hasCategoryPicker ? (
    <div className="flex h-full min-h-0 flex-col">
      {searchInput}
      {normalizedSearchQuery ? (
        <div role="listbox" aria-label={`${ariaLabel ?? 'Options'} search results`} className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto py-1" style={TOUCH_SCROLL_STYLE}>
          {searchGroups.length > 0 ? searchGroups.map((group) => (
            <div key={group.label} role="group" aria-label={group.label}>
              <div className="sticky top-0 bg-popover px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {group.label}
              </div>
              {group.options.map((option) => {
                const isSelected = selected.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => toggleOption(option)}
                    className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors hover:bg-accent ${
                      isSelected ? 'bg-accent/80 font-medium text-accent-foreground' : ''
                    }`}
                  >
                    <span>{option}</span>
                    {isSelected ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                  </button>
                );
              })}
            </div>
          )) : (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No matching kinks</p>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden sm:flex-row">
          {/* Horizontal category strip on mobile, vertical sidebar on desktop.
              The sidebar stretches and is allowed to shrink rather than taking
              h-full: Safari does not resolve a percentage height against a flex
              parent that has no definite height of its own, so the sidebar grew
              to fit every category, its own overflow never engaged, and the
              list was cut off part way down the alphabet. */}
          <div
            ref={tablistRef}
            role="tablist"
            aria-label={`${ariaLabel ?? 'Options'} categories`}
            className="scrollbar-subtle flex w-full min-w-0 max-w-full shrink-0 gap-1 overflow-x-auto overscroll-x-contain border-b border-border p-2 sm:w-44 sm:min-h-0 sm:flex-none sm:flex-col sm:self-stretch sm:overflow-y-auto sm:border-b-0 sm:border-r"
            style={HORIZONTAL_TOUCH_SCROLL_STYLE}
            onTouchStart={handleTablistTouchStart}
            onTouchMove={handleTablistTouchMove}
            onTouchEnd={handleTablistTouchEnd}
          >
            {groups.map((group) => {
              const selectedCount = group.options.filter((option) => selected.includes(option)).length;
              const isActive = group.label === activeGroup.label;

              return (
                <button
                  key={group.label}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={(e) => {
                    setActiveGroupLabel(group.label);
                    e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                  }}
                  className={`flex shrink-0 whitespace-nowrap items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors sm:w-full sm:whitespace-normal ${
                    isActive ? 'bg-accent font-medium text-accent-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                  }`}
                >
                  <span>{group.label}</span>
                  {selectedCount > 0 ? (
                    <span aria-hidden="true" className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                      {selectedCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Options List for Active Category */}
          <div role="listbox" aria-label={ariaLabel} className="scrollbar-subtle min-h-0 min-w-0 flex-1 self-stretch overflow-y-auto py-1" style={TOUCH_SCROLL_STYLE}>
            <div role="group" aria-label={activeGroup.label || undefined} className="sm:grid sm:grid-cols-2">
              {activeGroup.options.map((option) => {
                const isSelected = selected.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => toggleOption(option)}
                    className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors hover:bg-accent ${
                      isSelected ? 'bg-accent/80 font-medium text-accent-foreground' : ''
                    }`}
                  >
                    <span>{option}</span>
                    {isSelected ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  ) : (
    searchable ? (
      <div className="flex h-full min-h-0 flex-col">
        {searchInput}
        {flatMenuContent}
      </div>
    ) : flatMenuContent
  );

  const menu = isOpen && menuPortal && portalStyle && portalRoot
    ? createPortal(
        <>
          <div
            ref={portalMenuRef}
            className="overflow-hidden overscroll-contain rounded-md border border-border bg-popover shadow-lg"
            style={{ ...portalStyle, touchAction: 'pan-x pan-y', pointerEvents: 'auto', zIndex: MENU_PORTAL_Z_INDEX + 1 }}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {menuContent}
          </div>
        </>,
        portalRoot
      )
    : null;

  return (
    <div className="space-y-2">
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={toggleMenu}
          className={DROPDOWN_TRIGGER_CLASS}
        >
          {selected.length > 0 ? `${selected.length} selected` : placeholder}
        </button>

        {menu}

        {isOpen && !menuPortal && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />
            <div
              className={`absolute left-0 right-0 z-20 overflow-hidden overscroll-contain rounded-md border border-border bg-popover shadow-lg ${
                resolvedMenuPlacement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
              }`}
              style={localMenuStyle ?? undefined}
            >
              {menuContent}
            </div>
          </>
        )}
      </div>

      {/*
        Selected badges render after the trigger, never before it. Above the
        trigger they add a row on the first selection and push the trigger down
        ~30px mid-interaction, which either slides the open menu's options out
        from under the tapping finger (inline menu) or leaves the portalled menu
        anchored to a stale position overlapping its own trigger (menuPortal).
      */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((item) => (
            <Badge key={item} variant="secondary" className="gap-1">
              {item}
              <button type="button" onClick={() => removeOption(item)} className="ml-1">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
