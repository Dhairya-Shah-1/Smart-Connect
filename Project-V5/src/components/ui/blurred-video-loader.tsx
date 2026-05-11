import { ASSETS } from "../../config/assets";

interface BlurredVideoLoaderProps {
  label: string;
  containerClassName?: string;
  cardClassName?: string;
  textClassName?: string;
}

export function BlurredVideoLoader({
  label,
  containerClassName = "",
  cardClassName = "",
  textClassName = "",
}: BlurredVideoLoaderProps) {
  return (
    <div className={containerClassName}>
      <div className={cardClassName}>
        <video
          className="z-10 h-[101px] w-[101px] object-contain"
          autoPlay
          loop
          muted
          playsInline
        >
          <source src={ASSETS.Map_loader} type="video/webm" />
        </video>
        <span className={textClassName}>{label}</span>
      </div>
    </div>
  );
}
