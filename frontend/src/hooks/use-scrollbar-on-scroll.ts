import { useCallback, useEffect, useRef, useState } from "react";

/** Shows a custom scrollbar while the element is being scrolled. */
export function useScrollbarOnScroll(hideDelayMs = 700) {
    const [isScrolling, setIsScrolling] = useState(false);
    const hideTimerRef = useRef<number>(0);

    const onScroll = useCallback(() => {
        setIsScrolling(true);
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = window.setTimeout(() => setIsScrolling(false), hideDelayMs);
    }, [hideDelayMs]);

    useEffect(() => () => window.clearTimeout(hideTimerRef.current), []);

    return { isScrolling, onScroll };
}
