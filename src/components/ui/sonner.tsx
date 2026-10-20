"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      // One dark snackbar in the bottom-left corner, out of the way of the upload panel
      position="bottom-left"
      className="toaster group"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "snackbar",
          description: "caption text-white/70",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
