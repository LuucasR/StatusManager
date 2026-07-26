import type { Employee } from "@prisma/client";

export function toEmployeeDto(employee: Employee) {
    return {
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        name: employee.name,
        role: employee.role,
        currentStatus: employee.currentStatus,
        statusSince: employee.statusSince,
        active: employee.active,
    };
}