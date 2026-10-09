import { DROPDOWN_TRIGGER_CLASS } from '../lib/controlStyles';
import { REPORT_REASON_OPTIONS, type ReportReason } from '../lib/reportApi';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

type ReportReasonPickerProps = {
  id: string;
  value: ReportReason | '';
  onChange: (reason: ReportReason) => void;
  disabled?: boolean;
};

export default function ReportReasonPicker({ id, value, onChange, disabled = false }: ReportReasonPickerProps) {
  return (
    <Select value={value || undefined} onValueChange={(next) => onChange(next as ReportReason)} disabled={disabled}>
      <SelectTrigger id={id} aria-label="Reason" aria-required="true" className={DROPDOWN_TRIGGER_CLASS}>
        <SelectValue placeholder="Choose a reason" />
      </SelectTrigger>
      <SelectContent className="z-[90]">
        {REPORT_REASON_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
