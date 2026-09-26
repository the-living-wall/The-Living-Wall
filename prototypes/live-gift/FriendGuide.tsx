import { useEffect, useState } from 'react';

const KEY = 'xiaoying-friends-guide-v1';
const copy = (
  <>
    <p>留言互动：在这里，和朋友说说话。</p>
    <p>一起塑造：共同选择小莹的样子。</p>
  </>
);

export default function FriendGuide() {
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        if (localStorage.getItem(KEY)) return;
        localStorage.setItem(KEY, 'seen');
      } catch {
        /* The guide works without storage. */
      }
      setVisible(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!visible || hovered || focused) return;
    const timer = window.setTimeout(() => setVisible(false), 2000);
    return () => window.clearTimeout(timer);
  }, [visible, hovered, focused]);
  return (
    <div
      className="friend-guide"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
    >
      <div
        className={`friend-guide-intro${visible ? ' is-visible' : ''}`}
        aria-hidden={!visible}
      >
        {copy}
      </div>
      <details className="friend-guide-help">
        <summary>玩法说明</summary>
        {copy}
      </details>
    </div>
  );
}
