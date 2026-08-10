import type { ReactNode, CSSProperties } from 'react';

interface Props {
  width?: string | number;
  height?: string | number;
  className?: string;
  children?: ReactNode;
}

export default function Skeleton({ width = '100%', height = '1em', className = '' }: Props) {
  const style = {
    width,
    height,
  } as CSSProperties;
  return <div className={`skeleton ${className}`.trim()} style={style} />;
}
