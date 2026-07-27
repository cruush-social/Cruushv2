import type { CSSProperties } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Badge } from './ui/badge';
import { X } from 'lucide-react';

export type MultiSelectOptionGroup = {
  label: string;
  options: string[];
};

const MENU_MAX_HEIGHT = 288;
const MENU_MIN_HEIGHT = 96;
const MENU_OFFSET = 8;
const MENU_VIEWPORT_PADDING = 16;
const MENU_FLIP_THRESHOLD = 220;

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
}: MultiSelectProps) {
  const [selected, setSelected] = useState<string[]>(value);
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [resolvedMenuPlacement, setResolvedMenuPlacement] = useState<ResolvedMenuPlacement>(menuPlacement);
  const [localMenuStyle, setLocalMenuStyle] = useState<CSSProperties | null>(null);
  const [portalStyle, setPortalStyle] = useState<CSSProperties | null>(null);
  const groups = useMemo(() => optionGroups ?? [{ label: '', options }], [optionGroups, options]);
  const hasCategoryPicker = Boolean(optionGroups?.length && optionGroups.length > 1);
  const [activeGroupLabel, setActiveGroupLabel] = useState(groups[0]?.label ?? '');
  const activeGroup = groups.find((group) => group.label === activeGroupLabel) ?? groups[0] ?? { label: '', options: [] };

  useEffect(() => {
    setSelected(value);
  }, [value]);

  useEffect(() => {
    if (!groups.some((group) => group.label === activeGroupLabel)) {
      setActiveGroupLabel(groups[0]?.label ?? '');
    }
  }, [activeGroupLabel, groups]);

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) {
      setResolvedMenuPlacement(menuPlacement);
      setLocalMenuStyle(null);
      setPortalStyle(null);
      return;
    }

    const updatePortalStyle = () => {
      if (!triggerRef.current) {
        return;
      }

      const rect = triggerRef.current.getBoundingClientRect();
      const bottomSpace = window.innerHeight - rect.bottom - MENU_VIEWPORT_PADDING - MENU_OFFSET;
      const topSpace = rect.top - MENU_VIEWPORT_PADDING - MENU_OFFSET;
      const placeAbove = menuPlacement === 'top' || (
        menuPlacement === 'bottom' &&
        bottomSpace < MENU_FLIP_THRESHOLD &&
        topSpace > bottomSpace
      );
      const availableHeight = Math.max(0, placeAbove ? topSpace : bottomSpace);
      const maxHeight = Math.max(MENU_MIN_HEIGHT, Math.min(MENU_MAX_HEIGHT, availableHeight));
      setResolvedMenuPlacement(placeAbove ? 'top' : 'bottom');
      setLocalMenuStyle(menuPortal ? null : { maxHeight });

      if (!menuPortal) {
        setPortalStyle(null);
        return;
      }

      const availableWidth = Math.max(0, window.innerWidth - MENU_VIEWPORT_PADDING * 2);
      const width = Math.min(rect.width, availableWidth);
      const left = Math.min(
        Math.max(MENU_VIEWPORT_PADDING, rect.left),
        Math.max(MENU_VIEWPORT_PADDING, window.innerWidth - width - MENU_VIEWPORT_PADDING),
      );

      setPortalStyle(placeAbove
        ? {
            bottom: window.innerHeight - rect.top + MENU_OFFSET,
            left,
            maxHeight,
            position: 'fixed',
            width,
          }
        : {
            left,
            maxHeight,
            position: 'fixed',
            top: rect.bottom + MENU_OFFSET,
            width,
          });
    };

    updatePortalStyle();
    window.addEventListener('resize', updatePortalStyle);
    window.addEventListener('scroll', updatePortalStyle, true);

    return () => {
      window.removeEventListener('resize', updatePortalStyle);
      window.removeEventListener('scroll', updatePortalStyle, true);
    };
  }, [isOpen, menuPlacement, menuPortal]);

  const toggleOption = (option: string) => {
    if (selectionMode === 'multiple' && disableAddingOptions && !selected.includes(option)) {
      onAddingDisabled?.();
      return;
    }

    if (selectionMode === 'multiple' && maxSelections && selected.length >= maxSelections && !selected.includes(option)) {
      return;
    }

    const newSelected = selectionMode === 'single'
      ? selected.includes(option) ? [] : [option]
      : selected.includes(option)
        ? selected.filter((s) => s !== option)
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

  const menuContent = (
    <>
      {hasCategoryPicker ? (
        <div className="grid max-h-80 sm:grid-cols-[11rem_minmax(0,1fr)]">
          <div
            role="tablist"
            aria-label={`${ariaLabel ?? 'Options'} categories`}
            className="flex gap-1 overflow-x-auto border-b border-border p-2 sm:max-h-80 sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r"
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
                  onClick={() => setActiveGroupLabel(group.label)}
                  className={`flex shrink-0 items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors sm:w-full ${
                    isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
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

          <div role="listbox" aria-label={ariaLabel} className="max-h-64 overflow-y-auto py-1 sm:max-h-80">
            <div role="group" aria-label={activeGroup.label || undefined}>
              {activeGroup.options.map((option) => (
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
          </div>
        </div>
      ) : (
        <div role="listbox" aria-label={ariaLabel} className="max-h-72 overflow-y-auto">
          {groups.map((group) => (
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
      )}
    </>
  );

  const menu = isOpen && menuPortal && portalStyle
    ? createPortal(
        <>
          <div
            className="fixed inset-0 z-[90]"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="z-[100] overflow-x-hidden overflow-y-auto overscroll-contain rounded-md border border-border bg-popover shadow-lg"
            style={portalStyle}
          >
            {menuContent}
          </div>
        </>,
        document.body
      )
    : null;

  return (
    <div className="space-y-2">
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

      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => setIsOpen(!isOpen)}
          className="w-full h-10 px-3 text-left rounded-md bg-input-background border border-input hover:border-primary transition-colors"
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
              className={`absolute left-0 right-0 z-20 overflow-x-hidden overflow-y-auto overscroll-contain rounded-md border border-border bg-popover shadow-lg ${
                resolvedMenuPlacement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
              }`}
              style={localMenuStyle ?? undefined}
            >
              {menuContent}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
