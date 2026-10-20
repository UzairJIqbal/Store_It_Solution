"use client";

import {
    Label,
    PolarAngleAxis,
    PolarGrid,
    PolarRadiusAxis,
    RadialBar,
    RadialBarChart,
} from "recharts";

import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from "@/components/ui/card";
import { ChartConfig, ChartContainer } from "@/components/ui/chart";
import { convertFileSize, formatUsagePercent, getUsageLevel } from "@/lib/utils";

const chartConfig = {
    size: {
        label: "Size",
    },
    used: {
        label: "Used",
        color: "white",
    },
} satisfies ChartConfig;

export const Chart = ({ used = 0, total }: { used: number; total: number }) => {
    const percent = total > 0 ? Math.min((used / total) * 100, 100) : 0;
    const level = getUsageLevel(percent);
    const chartData = [{ name: "used", value: percent, fill: "white" }];

    return (
        <Card className="chart">
            <CardContent className="flex-1 p-0">
                <ChartContainer config={chartConfig} className="chart-container">
                    <RadialBarChart
                        data={chartData}
                        startAngle={90}
                        endAngle={-270}
                        innerRadius={80}
                        outerRadius={110}
                    >
                        <PolarGrid
                            gridType="circle"
                            radialLines={false}
                            stroke="none"
                            className="polar-grid"
                            polarRadius={[86, 74]}
                        />
                        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
                        <RadialBar dataKey="value" cornerRadius={10} />
                        <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
                            <Label
                                content={({ viewBox }) => {
                                    if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                                        return (
                                            <text
                                                x={viewBox.cx}
                                                y={viewBox.cy}
                                                textAnchor="middle"
                                                dominantBaseline="middle"
                                            >
                                                <tspan
                                                    x={viewBox.cx}
                                                    y={viewBox.cy}
                                                    className="chart-total-percentage"
                                                >
                                                    {formatUsagePercent(percent)}
                                                </tspan>
                                                <tspan
                                                    x={viewBox.cx}
                                                    y={(viewBox.cy || 0) + 24}
                                                    className="fill-white/70"
                                                >
                                                    Space used
                                                </tspan>
                                            </text>
                                        );
                                    }
                                }}
                            />
                        </PolarRadiusAxis>
                    </RadialBarChart>
                </ChartContainer>
            </CardContent>
            <CardHeader className="chart-details">
                <CardTitle className="chart-title">Available Storage</CardTitle>
                <CardDescription className="chart-description">
                    {convertFileSize(used)} of {convertFileSize(total)} used
                </CardDescription>
                {level !== "normal" && (
                    <p className="chart-warning" role="status">
                        {level === "critical" ? "Storage is almost full" : "You're running low on storage"}
                    </p>
                )}
            </CardHeader>
        </Card>
    );
};