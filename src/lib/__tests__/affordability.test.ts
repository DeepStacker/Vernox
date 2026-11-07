import { beforeEach, describe, expect, it, vi } from 'vitest';
import { affordabilityAmountPaise, EMI_MIN_RUPEES, razorpayKeyId, renderAffordabilityWidget, whenPageIdle } from '../emi/affordability';

describe('EMI widget guards', () => {
  it('has no key when VITE_RAZORPAY_KEY_ID is unset or blank', () => {
    expect(razorpayKeyId({})).toBeNull();
    expect(razorpayKeyId({ VITE_RAZORPAY_KEY_ID: '  ' })).toBeNull();
    expect(razorpayKeyId({ VITE_RAZORPAY_KEY_ID: ' rzp_test_x ' })).toBe('rzp_test_x');
  });

  it('shows nothing without a key or for tiny or invalid amounts', () => {
    expect(affordabilityAmountPaise(10000, null)).toBeNull();
    expect(affordabilityAmountPaise(EMI_MIN_RUPEES - 1, 'rzp_test_x')).toBeNull();
    expect(affordabilityAmountPaise(Number.NaN, 'rzp_test_x')).toBeNull();
  });

  it('converts rupees to paise', () => {
    expect(affordabilityAmountPaise(4000, 'rzp_test_x')).toBe(400000);
    expect(affordabilityAmountPaise(4720.5, 'rzp_test_x')).toBe(472050);
  });
});

describe('whenPageIdle', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('waits for the load event before running, and can be cancelled', () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    vi.useFakeTimers();
    const task = vi.fn();
    const cancel = whenPageIdle(task);
    vi.advanceTimersByTime(10000);
    expect(task).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(5000);
    expect(task).toHaveBeenCalledTimes(1);
    cancel();
    vi.useRealTimers();
  });

  it('does not run after cancel', () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
    vi.useFakeTimers();
    const task = vi.fn();
    whenPageIdle(task)();
    vi.advanceTimersByTime(10000);
    expect(task).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('renderAffordabilityWidget', () => {
  it('resolves false instead of throwing when the script is blocked', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const original = document.head.appendChild.bind(document.head);
    vi.spyOn(document.head, 'appendChild').mockImplementation(node => {
      const result = original(node);
      queueMicrotask(() => (node as HTMLScriptElement).onerror?.(new Event('error')));
      return result;
    });
    const container = document.createElement('div');
    await expect(renderAffordabilityWidget('rzp_test_x', 400000, container)).resolves.toBe(false);
  });
});
