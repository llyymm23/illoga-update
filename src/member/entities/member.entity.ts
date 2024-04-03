import { Plan } from "src/plan/entities/plan.entity";
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { MemberType } from "../types/member.type";


@Entity({ name: 'members', })
export class Member {
    @PrimaryGeneratedColumn({ type: 'int' })
    memberId: number;

    @Column({ type: 'int', nullable: false })
    planId: number;

    @Column({ type: 'int', nullable: false })
    userId: number;

    @Column({ type: 'enum', enum: MemberType, default: MemberType.Member })
    type: MemberType;

    @ManyToOne(() => Plan, (plan) => plan.member, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'planId' })
    plan: Plan;
}