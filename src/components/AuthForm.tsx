"use client"
import React, { useState } from 'react'
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { createAccount } from '@/lib/appwrite/actions/user.action'
import { signInuser } from '@/lib/appwrite/actions/user.action'
import OtpModel from './OTPModel'
type FormType = "sign-in" | "sign-up"

const COPY = {
    "sign-in": {
        title: "Sign in",
        lead: "We'll email you a verification code. No password needed.",
        submit: "Email me a code",
        busy: "Sending code",
        switchText: "New to StoreIt?",
        switchLink: "Create an account",
        switchHref: "/sign-up",
    },
    "sign-up": {
        title: "Create your account",
        lead: "Free, with 2 GB of storage. We'll email you a code to confirm it's you.",
        submit: "Create account",
        busy: "Creating account",
        switchText: "Already have an account?",
        switchLink: "Sign in",
        switchHref: "/sign-in",
    },
}

const authFormSchema = (formType: FormType) => z.object({
    email: z.string().trim().min(1, "Enter your email address.").email("That doesn't look like an email address. Check for typos."),
    fullName: formType === "sign-up"
        ? z.string().trim().min(2, "Enter your name, at least 2 letters.").max(50, "Keep your name under 50 characters.")
        : z.string().optional(),
})

const AuthForm = ({ type }: { type: FormType }) => {
    const [isLoading, setIsLoading] = useState(false)
    const [errorMessage, setErrorMessage] = useState("")
    const [codeEmail, setCodeEmail] = useState<string | null>(null)
    const copy = COPY[type]

    const formSchema = authFormSchema(type)
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            fullName: "",
            email: ""
        },
    })
    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        setIsLoading(true)
        setErrorMessage("")
        try {
            const result = type === "sign-up"
                ? await createAccount({ fullName: values.fullName || '', email: values.email })
                : await signInuser({ email: values.email })
            if (result?.error) return setErrorMessage(result.error)

            setCodeEmail(values.email)
        } catch {
            setErrorMessage("Something went wrong on our side. Please try again.")
        } finally {
            setIsLoading(false)
        }
    }
    return (<>
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="auth-form" noValidate>
                <div className='space-y-2'>
                    <h1 className='form-title'>{copy.title}</h1>
                    <p className='body-1 text-light-200'>{copy.lead}</p>
                </div>
                {
                    type === 'sign-up' && (
                        <FormField
                            control={form.control}
                            name="fullName"
                            render={({ field }) => (
                                <FormItem>
                                    <div className='shad-form-item'>
                                        <FormLabel className='shad-form-label'>Full name</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Ada Lovelace" autoComplete='name' className='shad-input' {...field} />
                                        </FormControl>
                                    </div>
                                    <FormMessage className='shad-form-message' />
                                </FormItem>
                            )}
                        />
                    )}

                <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem>
                            <div className='shad-form-item'>
                                <FormLabel className='shad-form-label'>Email</FormLabel>
                                <FormControl>
                                    <Input type='email' placeholder="you@example.com" autoComplete='email' className='shad-input' {...field} />
                                </FormControl>
                            </div>
                            <FormMessage className='shad-form-message' />
                        </FormItem>
                    )}
                />

                {errorMessage && <p className='error-message' role='alert'>{errorMessage}</p>}

                <button type="submit" className='form-submit-button' disabled={isLoading}>
                    {isLoading ? <><Loader2 className='size-5 animate-spin' aria-hidden /> {copy.busy}</> : copy.submit}
                </button>

                <p className='body-2 text-light-200'>
                    {copy.switchText}{" "}
                    <Link href={copy.switchHref} className='font-semibold text-brand underline-offset-4 hover:underline'>
                        {copy.switchLink}
                    </Link>
                </p>
            </form>
        </Form>
        {codeEmail && <OtpModel email={codeEmail} onClose={() => setCodeEmail(null)} />}
    </>
    )
}

export default AuthForm
