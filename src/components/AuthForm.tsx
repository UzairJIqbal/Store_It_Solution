"use client"
import React, { useState } from 'react'
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import Image from 'next/image'
import Link from 'next/link'
import { createAccount } from '@/lib/appwrite/actions/user.action'
import { signInuser } from '@/lib/appwrite/actions/user.action'
import OtpModel from './OTPModel'
type FormType = "sign-in" | "sign-up"

const AuthForm = ({ type }: { type: FormType }) => {
    const [isLoading, setIsLoading] = useState(false)
    const [errorMessage, setErrorMessage] = useState("")
    const [showOtpModal, setShowOtpModal] = useState(false);


    const authFormSchema = (formType: FormType) => {
        return z.object({
            email: z.string().email(),
            fullName: formType === "sign-up" ? z.string().min(2).max(50) : z.string().optional()
        })
    }
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

            type === "sign-up" ?
                await createAccount({
                    fullName: values.fullName || '',
                    email: values.email,
                }) : type === await signInuser({ email: values.email })

            setShowOtpModal(true);


        } catch (error) {
            setErrorMessage("Fail to create again please try again")
        } finally {
            setIsLoading(false)
        }
    }
    return (<>

        <div>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="auth-form">
                    <h1 className='form-title'>
                        {
                            type === "sign-in" ? "Sign In" : "Sign Up"
                        }
                    </h1>
                    {
                        type === 'sign-up' && (
                            <FormField
                                control={form.control}
                                name="fullName"
                                render={({ field }) => (
                                    <FormItem>
                                        <div className='shad-form-item'>
                                            <FormLabel className='shad-form=label'>Full Name</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Enter your Full Name" className='shad-input' {...field} />
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
                                    <FormLabel className='shad-form=label'>Email</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Enter your Email" className='shad-input' {...field} />
                                    </FormControl>
                                </div>
                                <FormMessage className='shad-form-message' />
                            </FormItem>
                        )}
                    />

                    <Button type="submit" className='form-submit-button' disabled={isLoading}>
                        {type === "sign-in" ? "Sign-In" : "Sign-Up"}
                        {isLoading && (<Image
                            src="/assets/icons/loader.svg"
                            alt='loader'
                            width={24}
                            height={24}
                            className='animate-spin' />
                        )}
                    </Button>
                    {
                        errorMessage && (<p className='error-message'>{errorMessage}</p>)
                    }
                    <div className='body-2 flex justify-center'>
                        <p>
                            {
                                type === "sign-in" ? "Don't have an account" : "Already have an account"
                            }
                        </p>

                        <Link
                            href=
                            {type === "sign-in" ? "/sign-up" : "/sign-in"}
                            className='ml-1 font-medium text-brand'>
                            {" "}
                            {
                                type === "sign-in" ? "sign Up" : "sign In"
                            }
                        </Link>

                    </div>
                </form>
            </Form>
            {showOtpModal && <OtpModel email={form.getValues('email')} />}

        </div>
    </>
    )
}

export default AuthForm